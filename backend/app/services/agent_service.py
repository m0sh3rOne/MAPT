from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.device import Device
from app.models.deployment import Deployment, DeploymentTarget, TargetStatus
from app.models.audit import AuditAction
from app.repositories.device_repository import DeviceRepository
from app.repositories.deployment_repository import DeploymentRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.agent import (
    AgentEnrollRequest, AgentEnrollResponse,
    AgentHeartbeatRequest, AgentHeartbeatResponse,
    AgentJobPayload, TargetLogCreate
)
from app.schemas.device import DeviceInventoryUpdate
from app.core.config import settings
from app.core.security import generate_agent_token


class AgentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.device_repo = DeviceRepository(db)
        self.dep_repo = DeploymentRepository(db)
        self.audit_repo = AuditRepository(db)

    async def enroll_agent(self, enroll_in: AgentEnrollRequest, ip_address: Optional[str] = None) -> AgentEnrollResponse:
        # Validation du token d'enrôlement (Secret partagé)
        valid_tokens = {settings.DEFAULT_ENROLLMENT_TOKEN, "mapt-enroll-secret-token-2026", "mapt-enrollment-secret-token-2026"}
        if enroll_in.enrollment_token not in valid_tokens:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token d'enrôlement invalide ou expiré."
            )

        agent_token = generate_agent_token()
        now = datetime.now(timezone.utc)

        device = await self.device_repo.get_by_uuid(enroll_in.device_uuid)
        if not device:
            device = Device(
                device_uuid=enroll_in.device_uuid,
                hostname=enroll_in.hostname,
                os_name=enroll_in.os_name,
                os_version=enroll_in.os_version,
                os_build=enroll_in.os_build,
                agent_version=enroll_in.agent_version,
                ip_address=ip_address or enroll_in.ip_address,
                agent_token=agent_token,
                enabled=True,
                last_seen_at=now
            )
            device = await self.device_repo.create(device)
        else:
            device.hostname = enroll_in.hostname
            device.os_name = enroll_in.os_name
            device.os_version = enroll_in.os_version
            device.os_build = enroll_in.os_build
            device.agent_version = enroll_in.agent_version
            device.ip_address = ip_address or enroll_in.ip_address
            device.agent_token = agent_token
            device.last_seen_at = now
            device.is_archived = False
            device = await self.device_repo.update(device)

        await self.audit_repo.create(
            action=AuditAction.DEVICE_ENROLLED,
            entity_type="device",
            entity_id=device.id,
            details={"hostname": device.hostname, "device_uuid": str(device.device_uuid)},
            ip_address=ip_address
        )

        return AgentEnrollResponse(
            device_id=device.id,
            device_uuid=device.device_uuid,
            agent_token=agent_token,
            server_time=now,
            poll_interval_seconds=settings.AGENT_JOB_POLL_INTERVAL_SECONDS,
            heartbeat_interval_seconds=settings.AGENT_HEARTBEAT_INTERVAL_SECONDS,
            inventory_interval_seconds=settings.AGENT_INVENTORY_INTERVAL_SECONDS
        )

    async def authenticate_agent(self, agent_token: str) -> Device:
        """
        Authentifie l'agent à partir de son Bearer token
        """
        device = await self.device_repo.get_by_token(agent_token)
        if not device:
            raise HTTPException(status_code=401, detail="Token d'agent invalide.")
        if not device.enabled:
            raise HTTPException(status_code=403, detail="Agent désactivé administrativement.")
        return device

    async def process_heartbeat(self, device: Device, heartbeat_in: AgentHeartbeatRequest, ip_address: Optional[str] = None) -> AgentHeartbeatResponse:
        await self.device_repo.update_last_seen(
            device_id=device.id,
            ip_address=ip_address or heartbeat_in.ip_address,
            agent_version=heartbeat_in.agent_version
        )
        return AgentHeartbeatResponse(
            acknowledged=True,
            server_time=datetime.now(timezone.utc),
            poll_interval_seconds=settings.AGENT_JOB_POLL_INTERVAL_SECONDS,
            inventory_interval_seconds=settings.AGENT_INVENTORY_INTERVAL_SECONDS
        )

    async def get_jobs_for_agent(self, device: Device) -> List[AgentJobPayload]:
        targets = await self.dep_repo.get_pending_targets_for_device(device.id)
        job_payloads = []

        for target in targets:
            # Passer à l'état OFFERED
            await self.dep_repo.update_target_status(target.id, TargetStatus.OFFERED)

            dep = target.deployment
            payload_data: Dict[str, Any] = {}
            job_type = dep.deployment_type
            timeout = 300

            if dep.deployment_type == "package" and dep.package_version:
                pv = dep.package_version
                job_type = "package"
                dest_folder = pv.destination_folder or "%ProgramData%\\MAPT\\packages"
                if "APPDATA" in dest_folder.upper():
                    dest_folder = "%ProgramData%\\MAPT\\packages"
                payload_data = {
                    "filename": pv.filename,
                    "storage_key": pv.storage_key,
                    "download_url": f"{settings.API_V1_STR}/agent/packages/download/{pv.storage_key}",
                    "sha256": pv.sha256,
                    "size_bytes": pv.size_bytes,
                    "run_with": pv.run_with,
                    "run_with_args": pv.run_with_args,
                    "package_args": pv.package_args,
                    "run_as_admin": pv.run_as_admin,
                    "destination_folder": dest_folder,
                    "install_command": pv.install_command,
                    "package_type": pv.package.package_type if pv.package else "msi"
                }
            elif (dep.deployment_type in ["script", "powershell", "python", "vbscript", "vbs", "cmd", "batch"] or dep.script_version_id) and dep.script_version:
                sv = dep.script_version
                job_type = sv.script.language if sv.script else "powershell"
                timeout = sv.timeout_seconds
                payload_data = {
                    "script_name": sv.script.name if sv.script else "script",
                    "version": sv.version,
                    "language": job_type,
                    "content": sv.content,
                    "sha256": sv.sha256
                }
            elif dep.deployment_type == "command":
                job_type = "command"
                payload_data = {
                    "command": dep.custom_command
                }

            job_payloads.append(AgentJobPayload(
                job_id=target.id,
                type=job_type,
                timeout_seconds=timeout,
                payload=payload_data
            ))

        return job_payloads

    async def ack_job(self, device: Device, job_id: UUID):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        await self.dep_repo.update_target_status(job_id, TargetStatus.ACKED)
        await self.dep_repo.add_target_log(job_id, "INFO", "Job reçu et acquitté par l'agent.")

    async def progress_job(self, device: Device, job_id: UUID, progress: int, message: Optional[str]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        await self.dep_repo.update_target_status(job_id, TargetStatus.RUNNING)
        if message:
            await self.dep_repo.add_target_log(job_id, "INFO", f"[{progress}%] {message}")

    async def complete_job(self, device: Device, job_id: UUID, exit_code: int, duration_seconds: Optional[float], output: Optional[str]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        await self.dep_repo.update_target_status(job_id, TargetStatus.SUCCEEDED, exit_code=exit_code)
        msg = f"Job terminé avec succès (code {exit_code})."
        if duration_seconds:
            msg += f" Durée: {duration_seconds:.1f}s"
        await self.dep_repo.add_target_log(job_id, "INFO", msg)
        if output:
            await self.dep_repo.add_target_log(job_id, "DEBUG", f"Sortie: {output}")

    async def fail_job(self, device: Device, job_id: UUID, exit_code: int, error: str, output: Optional[str]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        await self.dep_repo.update_target_status(job_id, TargetStatus.FAILED, exit_code=exit_code, error_message=error)
        await self.dep_repo.add_target_log(job_id, "ERROR", f"Échec du job (code {exit_code}): {error}")
        if output:
            await self.dep_repo.add_target_log(job_id, "DEBUG", f"Sortie: {output}")

    async def add_job_logs(self, device: Device, job_id: UUID, logs: List[TargetLogCreate]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        for log in logs:
            await self.dep_repo.add_target_log(job_id, log.level, log.message, log.timestamp)

    async def update_inventory(self, device: Device, inventory_in: DeviceInventoryUpdate):
        from app.core.sanitizer import sanitize_data
        raw_dict = inventory_in.model_dump(exclude_unset=True)
        cleaned_dict = sanitize_data(raw_dict)
        await self.device_repo.upsert_inventory(device.id, cleaned_dict)
