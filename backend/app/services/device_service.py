from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.device import Device
from app.models.inventory import DeviceInventory
from app.models.audit import AuditAction
from app.repositories.device_repository import DeviceRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.device import DeviceResponse, DeviceInventoryResponse
from app.core.config import settings


class DeviceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.device_repo = DeviceRepository(db)
        self.group_repo = GroupRepository(db)
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
        best_ip = None

        if device.inventory:
            # 1. Inspect network_interfaces to prioritize connected physical adapters
            if device.inventory.network_interfaces and isinstance(device.inventory.network_interfaces, list):
                def iface_priority(iface: dict):
                    if not isinstance(iface, dict):
                        return 99
                    status = str(iface.get("status", "")).lower()
                    ips = iface.get("ip_addresses") or []
                    has_gw = bool(iface.get("default_gateways"))
                    is_phys = bool(iface.get("is_physical"))
                    is_conn = status in ("connected", "active") or len(ips) > 0

                    if is_conn and has_gw and is_phys:
                        return 1
                    if is_conn and has_gw:
                        return 2
                    if is_conn and is_phys:
                        return 3
                    if is_conn:
                        return 4
                    return 5

                sorted_ifaces = sorted(
                    [i for i in device.inventory.network_interfaces if isinstance(i, dict)],
                    key=iface_priority
                )

                for iface in sorted_ifaces:
                    m = iface.get("mac_address") or iface.get("mac")
                    if m and str(m) not in macs:
                        macs.append(str(m))

                    if not best_ip:
                        ips = iface.get("ip_addresses") or []
                        for ip in ips:
                            if ip and not ip.startswith("127.") and not ip.startswith("169.254.") and not ip.startswith("172.18.") and not ip.startswith("172.17."):
                                best_ip = str(ip)
                                break

            # Fallback for remaining mac_addresses
            if device.inventory.mac_addresses and isinstance(device.inventory.mac_addresses, list):
                for m in device.inventory.mac_addresses:
                    if m and str(m) not in macs:
                        macs.append(str(m))

            if macs:
                primary_mac = macs[0]

        effective_ip = device.ip_address
        if not effective_ip or effective_ip.startswith("172.18.") or effective_ip.startswith("172.17.") or effective_ip.startswith("127."):
            if best_ip:
                effective_ip = best_ip

        is_appr = getattr(device, "is_approved", True)
        if is_appr is None:
            is_appr = True

        return DeviceResponse(
            id=device.id,
            device_uuid=device.device_uuid,
            hostname=device.hostname,
            os_name=device.os_name,
            os_version=device.os_version,
            os_build=device.os_build,
            agent_version=device.agent_version,
            ip_address=effective_ip,
            is_approved=is_appr,
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

    async def approve_device(self, device_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> DeviceResponse:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")
        device.is_approved = True
        device.enabled = True
        device.updated_at = datetime.now(timezone.utc)
        updated = await self.device_repo.update(device)

        await self.audit_repo.create(
            action=AuditAction.DEVICE_APPROVED,
            entity_type="device",
            user_id=user_id,
            entity_id=device.id,
            details={"hostname": device.hostname, "is_approved": True},
            ip_address=ip_address
        )
        return self._map_to_response(updated)

    async def unapprove_device(self, device_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> DeviceResponse:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")
        device.is_approved = False
        device.updated_at = datetime.now(timezone.utc)
        updated = await self.device_repo.update(device)

        await self.audit_repo.create(
            action=AuditAction.DEVICE_UNAPPROVED,
            entity_type="device",
            user_id=user_id,
            entity_id=device.id,
            details={"hostname": device.hostname, "is_approved": False},
            ip_address=ip_address
        )
        return self._map_to_response(updated)

    async def approve_devices_batch(self, device_ids: List[UUID], user_id: UUID, ip_address: Optional[str] = None) -> int:
        if not device_ids:
            return 0
        approved_count = 0
        for d_id in device_ids:
            device = await self.device_repo.get_by_id(d_id)
            if not device or device.is_archived:
                continue
            device.is_approved = True
            device.enabled = True
            device.updated_at = datetime.now(timezone.utc)
            await self.device_repo.update(device)

            await self.audit_repo.create(
                action=AuditAction.DEVICE_APPROVED,
                entity_type="device",
                user_id=user_id,
                entity_id=device.id,
                details={"hostname": device.hostname, "is_approved": True, "batch": True},
                ip_address=ip_address
            )
            approved_count += 1
        await self.db.commit()
        return approved_count

    async def delete_device(self, device_id: UUID, user_id: UUID, ip_address: Optional[str] = None, uninstall_agent: bool = True):
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine introuvable.")

        # Retrait préalable de la machine de tous les groupes
        await self.group_repo.remove_device_from_all_groups(device.id)

        # Si demandé et que l'agent a un token d'accès, on émet immédiatement un job de désinstallation propre
        if uninstall_agent and device.agent_token:
            try:
                from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
                import base64
                ps_script = (
                    "$procArgs = @(\n"
                    "    '-NoProfile',\n"
                    "    '-NonInteractive',\n"
                    "    '-ExecutionPolicy', 'Bypass',\n"
                    "    '-Command',\n"
                    "    \"Start-Sleep -Seconds 4; Stop-Service -Name 'mapt-agent' -Force -ErrorAction SilentlyContinue; & 'C:\\Program Files\\MAPT\\mapt-agent.exe' -service stop; & 'C:\\Program Files\\MAPT\\mapt-agent.exe' -service uninstall; sc.exe delete 'mapt-agent'; Start-Sleep -Seconds 2; Remove-Item -Path 'C:\\Program Files\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path 'HKLM:\\Software\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue\"\n"
                    ")\n"
                    "Start-Process powershell.exe -ArgumentList $procArgs -WindowStyle Hidden\n"
                    "Write-Host 'Ordre de désinstallation détaché initié avec succès.'\n"
                )
                b64_cmd = base64.b64encode(ps_script.encode('utf-16le')).decode('ascii')
                uninstall_ps = f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {b64_cmd}"
                dep = Deployment(
                    name=f"🗑️ Désinstallation de l'agent - {device.hostname}",
                    description="Désinstallation propre de l'agent et suppression du service Windows avant retrait du parc",
                    deployment_type="command",
                    custom_command=uninstall_ps,
                    created_by=user_id,
                    target_all_devices=False,
                    target_device_ids=[str(device.id)],
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
            except Exception as e:
                from app.core.logging import logger
                logger.error(f"Erreur lors de la création du job de désinstallation pour {device.hostname}: {e}")

        # Soft delete (archivage pour masquer immédiatement de l'inventaire)
        device.is_archived = True
        device.updated_at = datetime.now(timezone.utc)
        await self.device_repo.update(device)

        # Enregistrement garanti dans le Journal d'Audit
        await self.audit_repo.create(
            action=AuditAction.DEVICE_DELETED,
            entity_type="device",
            user_id=user_id,
            entity_id=device.id,
            details={
                "hostname": device.hostname,
                "ip_address": device.ip_address,
                "mac_address": getattr(device, "mac_address", None),
                "uninstalled_agent": uninstall_agent
            },
            ip_address=ip_address
        )
        await self.db.commit()

    async def delete_devices_batch(self, device_ids: List[UUID], user_id: UUID, ip_address: Optional[str] = None, uninstall_agent: bool = True) -> int:
        if not device_ids:
            return 0

        # Retrait préalable des machines de tous les groupes
        await self.group_repo.remove_devices_from_all_groups(device_ids)

        deleted_count = 0
        for d_id in device_ids:
            device = await self.device_repo.get_by_id(d_id)
            if not device or device.is_archived:
                continue

            # Création du job de désinstallation si applicable
            if uninstall_agent and device.agent_token:
                try:
                    from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
                    import base64
                    ps_script = (
                        "$procArgs = @(\n"
                        "    '-NoProfile',\n"
                        "    '-NonInteractive',\n"
                        "    '-ExecutionPolicy', 'Bypass',\n"
                        "    '-Command',\n"
                        "    \"Start-Sleep -Seconds 4; Stop-Service -Name 'mapt-agent' -Force -ErrorAction SilentlyContinue; & 'C:\\Program Files\\MAPT\\mapt-agent.exe' -service stop; & 'C:\\Program Files\\MAPT\\mapt-agent.exe' -service uninstall; sc.exe delete 'mapt-agent'; Start-Sleep -Seconds 2; Remove-Item -Path 'C:\\Program Files\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path 'HKLM:\\Software\\MAPT' -Recurse -Force -ErrorAction SilentlyContinue\"\n"
                        ")\n"
                        "Start-Process powershell.exe -ArgumentList $procArgs -WindowStyle Hidden\n"
                        "Write-Host 'Ordre de désinstallation détaché initié avec succès.'\n"
                    )
                    b64_cmd = base64.b64encode(ps_script.encode('utf-16le')).decode('ascii')
                    uninstall_ps = f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {b64_cmd}"
                    dep = Deployment(
                        name=f"🗑️ Désinstallation de l'agent - {device.hostname}",
                        description="Désinstallation propre de l'agent et suppression du service Windows avant retrait du parc",
                        deployment_type="command",
                        custom_command=uninstall_ps,
                        created_by=user_id,
                        target_all_devices=False,
                        target_device_ids=[str(device.id)],
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
                except Exception as e:
                    from app.core.logging import logger
                    logger.error(f"Erreur désinstallation batch pour {device.hostname}: {e}")

            device.is_archived = True
            device.updated_at = datetime.now(timezone.utc)
            await self.device_repo.update(device)

            await self.audit_repo.create(
                action=AuditAction.DEVICE_DELETED,
                entity_type="device",
                user_id=user_id,
                entity_id=device.id,
                details={
                    "hostname": device.hostname,
                    "ip_address": device.ip_address,
                    "mac_address": getattr(device, "mac_address", None),
                    "uninstalled_agent": uninstall_agent,
                    "batch": True
                },
                ip_address=ip_address
            )
            deleted_count += 1

        await self.db.commit()
        return deleted_count

    async def get_device_inventory(self, device_id: UUID) -> Optional[DeviceInventoryResponse]:
        from app.core.sanitizer import sanitize_data, sanitize_string
        inventory = await self.device_repo.get_inventory(device_id)
        if not inventory:
            return None
        return DeviceInventoryResponse(
            device_id=inventory.device_id,
            cpu_model=sanitize_string(inventory.cpu_model),
            cpu_cores=inventory.cpu_cores,
            total_memory_mb=inventory.total_memory_mb,
            disk_total_gb=inventory.disk_total_gb,
            disk_free_gb=inventory.disk_free_gb,
            mac_addresses=inventory.mac_addresses,
            network_interfaces=sanitize_data(inventory.network_interfaces),
            current_user=sanitize_string(inventory.current_user),
            last_boot_at=inventory.last_boot_at,
            installed_software=sanitize_data(inventory.installed_software),
            local_users=sanitize_data(inventory.local_users),
            updated_at=inventory.updated_at
        )
