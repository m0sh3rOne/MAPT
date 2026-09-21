from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.device import Device
from app.models.inventory import DeviceInventory
from app.models.audit import AuditAction
from app.repositories.device_repository import DeviceRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.device import DeviceResponse, DeviceInventoryResponse
from app.core.config import settings


class DeviceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.device_repo = DeviceRepository(db)
        self.audit_repo = AuditRepository(db)

    def _is_online(self, last_seen_at: Optional[datetime]) -> bool:
        if not last_seen_at:
            return False
        now = datetime.now(timezone.utc)
        threshold = timedelta(seconds=settings.AGENT_OFFLINE_THRESHOLD_SECONDS)
        return (now - last_seen_at) <= threshold

    def _map_to_response(self, device: Device) -> DeviceResponse:
        group_ids = [m.group_id for m in device.group_memberships] if device.group_memberships else []
        macs = []
        primary_mac = None
        if device.inventory:
            if device.inventory.mac_addresses and isinstance(device.inventory.mac_addresses, list):
                for m in device.inventory.mac_addresses:
                    if m and m not in macs:
                        macs.append(str(m))
            if device.inventory.network_interfaces and isinstance(device.inventory.network_interfaces, list):
                for iface in device.inventory.network_interfaces:
                    if isinstance(iface, dict):
                        m = iface.get("mac_address") or iface.get("mac")
                        if m and m not in macs:
                            macs.append(str(m))
            if macs:
                primary_mac = macs[0]

        return DeviceResponse(
            id=device.id,
            device_uuid=device.device_uuid,
            hostname=device.hostname,
            os_name=device.os_name,
            os_version=device.os_version,
            os_build=device.os_build,
            agent_version=device.agent_version,
            ip_address=device.ip_address,
            enabled=device.enabled,
            is_online=self._is_online(device.last_seen_at),
            mac_address=primary_mac,
            mac_addresses=macs if macs else None,
            last_seen_at=device.last_seen_at,
            created_at=device.created_at,
            updated_at=device.updated_at,
            group_ids=group_ids
        )

    async def get_all_devices(self) -> List[DeviceResponse]:
        devices = await self.device_repo.get_all()
        return [self._map_to_response(d) for d in devices]

    async def get_device_by_id(self, device_id: UUID) -> DeviceResponse:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")
        return self._map_to_response(device)

    async def set_device_status(self, device_id: UUID, enabled: bool, user_id: UUID, ip_address: Optional[str] = None) -> DeviceResponse:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")
        device.enabled = enabled
        device.updated_at = datetime.now(timezone.utc)
        updated = await self.device_repo.update(device)

        action = AuditAction.DEVICE_ENABLED if enabled else AuditAction.DEVICE_DISABLED
        await self.audit_repo.create(
            action=action,
            entity_type="device",
            user_id=user_id,
            entity_id=device.id,
            details={"hostname": device.hostname, "enabled": enabled},
            ip_address=ip_address
        )
        return self._map_to_response(updated)

    async def delete_device(self, device_id: UUID, user_id: UUID, ip_address: Optional[str] = None, uninstall_agent: bool = True):
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")

        # Si demandé et que l'agent a un token d'accès, on émet immédiatement un job de désinstallation propre
        if uninstall_agent and device.agent_token:
            from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
            uninstall_ps = (
                "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
                "\"Stop-Service -Name 'mapt-agent' -Force -ErrorAction SilentlyContinue; "
                "& 'C:\\Program Files\\MAPT\\mapt-agent.exe' -service uninstall; "
                "sc.exe delete 'mapt-agent'; "
                "Start-Sleep -Seconds 2; "
                "Remove-Item -Path 'C:\\Program Files\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue; "
                "Remove-Item -Path 'HKLM:\\Software\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue\""
            )
            dep = Deployment(
                name=f"🗑️ Désinstallation de l'agent - {device.hostname}",
                description="Désinstallation propre de l'agent et suppression du service Windows avant retrait du parc",
                deployment_type="command",
                custom_command=uninstall_ps,
                created_by=user_id,
                target_all_devices=False,
                target_device_ids=[device.id],
                target_group_ids=[],
                status=DeploymentStatus.RUNNING,
                is_recurring=False,
                schedule_type="immediate"
            )
            self.db.add(dep)
            await self.db.flush()

            target = DeploymentTarget(
                deployment_id=dep.id,
                device_id=device.id,
                status=TargetStatus.PENDING,
                retry_count=0,
                max_retries=1
            )
            self.db.add(target)
            await self.db.commit()

        # Soft delete (archivage pour masquer immédiatement de l'inventaire)
        device.is_archived = True
        device.updated_at = datetime.now(timezone.utc)
        await self.device_repo.update(device)

        await self.audit_repo.create(
            action=AuditAction.DEVICE_DELETED,
            entity_type="device",
            user_id=user_id,
            entity_id=device.id,
            details={"hostname": device.hostname, "uninstalled_agent": uninstall_agent},
            ip_address=ip_address
        )

    async def get_device_inventory(self, device_id: UUID) -> Optional[DeviceInventoryResponse]:
        inventory = await self.device_repo.get_inventory(device_id)
        if not inventory:
            return None
        return DeviceInventoryResponse(
            device_id=inventory.device_id,
            cpu_model=inventory.cpu_model,
            cpu_cores=inventory.cpu_cores,
            total_memory_mb=inventory.total_memory_mb,
            disk_total_gb=inventory.disk_total_gb,
            disk_free_gb=inventory.disk_free_gb,
            mac_addresses=inventory.mac_addresses,
            network_interfaces=inventory.network_interfaces,
            current_user=inventory.current_user,
            last_boot_at=inventory.last_boot_at,
            installed_software=inventory.installed_software,
            local_users=inventory.local_users,
            updated_at=inventory.updated_at
        )
