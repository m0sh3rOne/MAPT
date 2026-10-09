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
        target_uuid = enroll_in.device_uuid

        # 1. Recherche si une machine existe déjà avec cet UUID
        device = await self.device_repo.get_by_uuid(target_uuid)

        # 2. Protection Anti-Collision Clone vs Renommage
        # Si une machine existe déjà avec cet UUID mais avec un nom d'hôte différent
        if device and enroll_in.hostname:
            existing_host = (device.hostname or "").strip().upper()
            incoming_host = (enroll_in.hostname or "").strip().upper()
            if existing_host and incoming_host and existing_host != incoming_host:
                incoming_ip = ip_address or enroll_in.ip_address
                is_concurrent_different_ip = (
                    device.ip_address 
                    and incoming_ip 
                    and device.ip_address != incoming_ip 
                    and device.last_seen_at 
                    and (now - device.last_seen_at).total_seconds() < 60
                )
                if is_concurrent_different_ip and not device.is_archived:
                    import uuid
                    new_uuid = str(uuid.uuid4())
                    from app.core.logging import logger
                    logger.warning(
                        f"⚠️ [Clone Protection] Collision d'UUID détectée ! L'UUID {target_uuid} est actif sur '{device.hostname}' ({device.ip_address}). "
                        f"Attribution automatique d'un nouvel UUID pour le clone '{enroll_in.hostname}' ({incoming_ip}) : {new_uuid}"
                    )
                    target_uuid = new_uuid
                    device = await self.device_repo.get_by_hostname(enroll_in.hostname)
                    if device:
                        device.device_uuid = target_uuid
                else:
                    # Même machine renommée
                    device.previous_hostname = device.hostname
                    device.hostname = enroll_in.hostname

        # 3. Si non trouvé par UUID, chercher si la machine existait déjà par nom d'hôte
        if not device and enroll_in.hostname:
            device = await self.device_repo.get_by_hostname(enroll_in.hostname)
            if device:
                device.device_uuid = target_uuid

        wins_reported = enroll_in.wins_name or enroll_in.hostname
        if not device:
            device = Device(
                device_uuid=target_uuid,
                hostname=enroll_in.hostname,
                wins_name=wins_reported,
                os_name=enroll_in.os_name,
                os_version=enroll_in.os_version,
                os_build=enroll_in.os_build,
                agent_version=enroll_in.agent_version,
                ip_address=ip_address or enroll_in.ip_address,
                agent_token=agent_token,
                is_approved=True,
                enabled=True,
                last_seen_at=now
            )
            device = await self.device_repo.create(device)
        else:
            if not device.wins_name:
                device.wins_name = wins_reported
            device.device_uuid = target_uuid
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

        # Enregistrement du nom WINS / NetBIOS réel de la machine Windows
        updated_device = False
        reported_wins = heartbeat_in.wins_name or heartbeat_in.hostname
        if reported_wins and reported_wins.strip():
            clean_wins = reported_wins.strip()
            if getattr(device, "wins_name", None) != clean_wins:
                device.wins_name = clean_wins
                updated_device = True

        # Mise à jour automatique et dynamique de la version de l'OS si transmise dans le heartbeat
        if heartbeat_in.os_name and heartbeat_in.os_name.strip() and heartbeat_in.os_name.lower() != "windows":
            if device.os_name != heartbeat_in.os_name:
                device.os_name = heartbeat_in.os_name
                updated_device = True
        if heartbeat_in.os_version and heartbeat_in.os_version.strip() and heartbeat_in.os_version.lower() != "windows":
            if device.os_version != heartbeat_in.os_version:
                device.os_version = heartbeat_in.os_version
                updated_device = True
        if heartbeat_in.os_build and heartbeat_in.os_build.strip() and heartbeat_in.os_build.lower() not in ["amd64", "x86_64", "x64"]:
            if device.os_build != heartbeat_in.os_build:
                device.os_build = heartbeat_in.os_build
                updated_device = True

        if updated_device:
            await self.device_repo.update(device)

        return AgentHeartbeatResponse(
            acknowledged=True,
            server_time=datetime.now(timezone.utc),
            poll_interval_seconds=settings.AGENT_JOB_POLL_INTERVAL_SECONDS,
            inventory_interval_seconds=settings.AGENT_INVENTORY_INTERVAL_SECONDS
        )

    async def trigger_on_login_deployments(self, device: Device) -> int:
        """
        Vérifie et instancie les déploiements récurrents 'on_login' ciblant la machine
        lorsqu'un utilisateur ouvre une session.
        """
        from sqlalchemy import select
        on_login_deps = await self.dep_repo.get_active_on_login_deployments()
        if not on_login_deps:
            return 0

        device_group_ids = set()
        try:
            from app.repositories.group_repository import GroupRepository
            group_repo = GroupRepository(self.db)
            device_group_ids = await group_repo.get_device_group_ids(device.id)
        except Exception:
            pass

        dev_id_str = str(device.id)
        now = datetime.now(timezone.utc)
        created_count = 0

        for dep in on_login_deps:
            is_target = False
            if dep.target_all_devices:
                is_target = True
            elif dep.target_device_ids and dev_id_str in [str(d) for d in dep.target_device_ids]:
                is_target = True
            elif dep.target_group_ids and any(str(gid) in [str(g) for g in dep.target_group_ids] for gid in device_group_ids):
                is_target = True

            if is_target:
                # Vérifier si une cible active est déjà en cours ou en attente pour ce device
                result = await self.db.execute(
                    select(DeploymentTarget)
                    .where(
                        DeploymentTarget.deployment_id == dep.id,
                        DeploymentTarget.device_id == device.id,
                        DeploymentTarget.status.in_([TargetStatus.PENDING, TargetStatus.OFFERED, TargetStatus.RUNNING, TargetStatus.ACKED])
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    new_target = DeploymentTarget(
                        deployment_id=dep.id,
                        device_id=device.id,
                        status=TargetStatus.PENDING,
                        created_at=now
                    )
                    self.db.add(new_target)
                    dep.last_run_at = now
                    created_count += 1

        if created_count > 0:
            await self.db.flush()
        return created_count

    async def get_jobs_for_agent(self, device: Device, trigger: Optional[str] = None) -> List[AgentJobPayload]:
        # Si un événement de connexion est transmis, déclencher les tâches récurrentes on_login
        if trigger in ["login", "logon"]:
            await self.trigger_on_login_deployments(device)

        targets = await self.dep_repo.get_pending_targets_for_device(device.id)
        job_payloads = []

        for target in targets:
            dep = target.deployment
            if not dep:
                continue

            # Concurrency rate-limiting (rolling deployment in waves)
            if target.status == TargetStatus.PENDING:
                max_concurrency = getattr(dep, "max_concurrency", 8) or 8
                if max_concurrency > 0:
                    active_count = await self.dep_repo.get_active_targets_count_for_deployment(dep.id)
                    if active_count >= max_concurrency:
                        # Concurrency limit reached for this wave, keep PENDING and wait for next poll
                        continue

            # Passer à l'état OFFERED
            await self.dep_repo.update_target_status(target.id, TargetStatus.OFFERED)

            payload_data: Dict[str, Any] = {}
            job_type = dep.deployment_type
            timeout = 300

            if dep.deployment_type == "package" and dep.package_version:
                pv = dep.package_version
                job_type = "package"
                is_interactive = bool(getattr(pv, "is_interactive", False))
                if is_interactive:
                    # En mode graphique l'agent ne couvre que la copie du binaire : le job est validé
                    # dès le lancement de l'assistant, que l'utilisateur déroule ensuite manuellement.
                    timeout = 900
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
                    "is_interactive": is_interactive,
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
            elif dep.deployment_type in ["powershell", "script", "ps1"] or (dep.custom_command and any(k in dep.custom_command for k in ["$ErrorActionPreference", "Write-Output", "Get-ChildItem", "$ProfileName"])):
                job_type = "powershell"
                timeout = 7200  # 2 hours for massive profile backups
                payload_data = {
                    "content": dep.custom_command,
                    "language": "powershell"
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
        if target.status == TargetStatus.CANCELLED:
            return
        await self.dep_repo.update_target_status(job_id, TargetStatus.RUNNING)
        if message:
            await self.dep_repo.add_target_log(job_id, "INFO", f"[{progress}%] {message}")

    async def complete_job(self, device: Device, job_id: UUID, exit_code: int, duration_seconds: Optional[float], output: Optional[str]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        if target.status == TargetStatus.CANCELLED:
            return
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
        if target.status == TargetStatus.CANCELLED:
            return
        await self.dep_repo.update_target_status(job_id, TargetStatus.FAILED, exit_code=exit_code, error_message=error)
        await self.dep_repo.add_target_log(job_id, "ERROR", f"Échec du job (code {exit_code}): {error}")
        if output:
            await self.dep_repo.add_target_log(job_id, "DEBUG", f"Sortie: {output}")

        # Synchroniser l'état du backup de profil si ce job est lié à un UserProfileBackup
        try:
            from app.models.profile_backup import UserProfileBackup, ProfileBackupStatus
            res = await self.db.execute(
                select(UserProfileBackup).where(
                    or_(
                        UserProfileBackup.backup_deployment_id == target.deployment_id,
                        UserProfileBackup.last_restore_deployment_id == target.deployment_id
                    )
                )
            )
            backup = res.scalar_one_or_none()
            if backup:
                if backup.backup_deployment_id == target.deployment_id and backup.status == ProfileBackupStatus.BACKING_UP:
                    backup.status = ProfileBackupStatus.FAILED
                    backup.error_message = error or f"Échec du job de sauvegarde (code {exit_code})"
                await self.db.commit()
        except Exception:
            pass

    async def add_job_logs(self, device: Device, job_id: UUID, logs: List[TargetLogCreate]):
        target = await self.dep_repo.get_target_by_id(job_id)
        if not target or target.device_id != device.id:
            raise HTTPException(status_code=404, detail="Job introuvable pour cet agent.")
        for log in logs:
            await self.dep_repo.add_target_log(job_id, log.level, log.message, log.timestamp)

    async def update_inventory(self, device: Device, inventory_in: DeviceInventoryUpdate):
        from app.core.sanitizer import sanitize_data
        raw_dict = inventory_in.model_dump(exclude_unset=True)

        # Si l'inventaire contient les informations d'OS détaillées (type winver)
        updated_os = False
        if inventory_in.os_caption and inventory_in.os_caption.strip() and inventory_in.os_caption.lower() != "windows":
            if device.os_name != inventory_in.os_caption:
                device.os_name = inventory_in.os_caption
                updated_os = True
        if inventory_in.os_display_version is not None and inventory_in.os_display_version.strip() and inventory_in.os_display_version.lower() != "windows":
            if device.os_version != inventory_in.os_display_version:
                device.os_version = inventory_in.os_display_version
                updated_os = True
        if inventory_in.os_build is not None and inventory_in.os_build.strip() and inventory_in.os_build.lower() not in ["amd64", "x86_64", "x64"]:
            if device.os_build != inventory_in.os_build:
                device.os_build = inventory_in.os_build
                updated_os = True
        # Si l'inventaire contient les informations WINS
        if inventory_in.wins_name and inventory_in.wins_name.strip():
            clean_wins = inventory_in.wins_name.strip()
            if getattr(device, "wins_name", None) != clean_wins:
                device.wins_name = clean_wins
                updated_os = True

        if updated_os:
            await self.device_repo.update(device)

        # Retirer les champs spécifiques à l'OS avant d'upsert dans device_inventory
        for k in ["os_caption", "os_display_version", "os_build", "os_architecture", "wins_name"]:
            raw_dict.pop(k, None)

        # Garantir que l'utilisateur actif est présent dans local_users et marqué connecté
        active_user = raw_dict.get("current_user")
        if active_user and isinstance(active_user, str) and active_user.strip():
            active_clean = active_user.strip()
            users_list = raw_dict.get("local_users") or []
            if isinstance(users_list, list):
                dom = ""
                uname = active_clean
                if "\\" in active_clean:
                    parts = active_clean.split("\\", 1)
                    dom = parts[0]
                    uname = parts[1]
                
                host_upper = (device.hostname or "").upper()
                is_dom = bool(dom and dom.upper() != host_upper and dom.upper() not in ["BUILTIN", "AUTORITE NT", "NT AUTHORITY"])
                
                found = False
                for u in users_list:
                    if isinstance(u, dict):
                        u_name = str(u.get("name", "")).strip().lower()
                        u_full = str(u.get("full_name", "")).strip().lower()
                        if u_name == uname.lower() or u_full == active_clean.lower():
                            u["is_logged_in"] = True
                            if is_dom:
                                u["account_type"] = "Domaine"
                                u["domain"] = dom
                            found = True
                
                if not found:
                    users_list.insert(0, {
                        "name": uname,
                        "domain": dom or ("Domaine" if is_dom else device.hostname),
                        "account_type": "Domaine" if is_dom else "Local",
                        "full_name": active_clean,
                        "description": "Utilisateur connecté en session active",
                        "enabled": True,
                        "privilege": "Utilisateur standard",
                        "is_admin": False,
                        "is_logged_in": True,
                        "last_logon": datetime.now(timezone.utc).isoformat()
                    })
                raw_dict["local_users"] = users_list

        cleaned_dict = sanitize_data(raw_dict)
        await self.device_repo.upsert_inventory(device.id, cleaned_dict)

        # Si un utilisateur actif est détecté en session, vérifier et instancier les tâches 'on_login'
        if active_user and isinstance(active_user, str) and active_user.strip():
            await self.trigger_on_login_deployments(device)
