import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.core.logging import logger
from app.models.device import Device
from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus


async def check_device_heartbeats():
    """
    Vérifie les agents inactifs et met à jour les métriques
    """
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(seconds=settings.AGENT_OFFLINE_THRESHOLD_SECONDS)
        
        result = await session.execute(
            select(Device).where(
                Device.enabled == True,
                Device.is_archived == False,
                Device.last_seen_at < threshold
            )
        )
        offline_devices = result.scalars().all()
        # logger.debug(f"Offline devices count: {len(offline_devices)}")


async def check_job_timeouts():
    """
    Vérifie les jobs bloqués au statut RUNNING au-delà du timeout configuré
    """
    from sqlalchemy.orm import selectinload
    from app.models.profile_backup import UserProfileBackup, ProfileBackupStatus
    from sqlalchemy import or_

    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(DeploymentTarget)
            .options(selectinload(DeploymentTarget.deployment))
            .where(DeploymentTarget.status == TargetStatus.RUNNING)
        )
        running_targets = result.scalars().all()
        has_changes = False

        for target in running_targets:
            if not target.started_at:
                continue

            # Déterminer le timeout applicable
            timeout_seconds = 1800  # 30 min par défaut au lieu de 10 min
            dep = target.deployment
            if dep:
                # Profil backup / restore: 2 heures (7200s) pour absorber les gros profils > 10 Go
                if (dep.name and any(k in dep.name.lower() for k in ["sauvegarde", "restauration", "profil"])) or (dep.custom_command and any(k in dep.custom_command for k in ["$ProfileName", "MAPT_ProfileBackup"])):
                    timeout_seconds = 7200
                elif dep.script_version and getattr(dep.script_version, "timeout_seconds", None):
                    timeout_seconds = max(dep.script_version.timeout_seconds, 60)

            if target.started_at < (now - timedelta(seconds=timeout_seconds)):
                target.status = TargetStatus.TIMED_OUT
                target.completed_at = now
                target.error_message = f"Délai d'exécution dépassé ({timeout_seconds}s) - Interrompu automatiquement par MAPT"
                logger.warning(f"Target {target.id} timed out after {timeout_seconds}s.")
                has_changes = True

                # Synchroniser UserProfileBackup si ce job y est rattaché
                try:
                    res_p = await session.execute(
                        select(UserProfileBackup).where(
                            or_(
                                UserProfileBackup.backup_deployment_id == target.deployment_id,
                                UserProfileBackup.last_restore_deployment_id == target.deployment_id
                            )
                        )
                    )
                    backup = res_p.scalar_one_or_none()
                    if backup:
                        if backup.backup_deployment_id == target.deployment_id and backup.status == ProfileBackupStatus.BACKING_UP:
                            backup.status = ProfileBackupStatus.FAILED
                            backup.error_message = f"Délai d'attente dépassé ({timeout_seconds}s)"
                        elif backup.last_restore_deployment_id == target.deployment_id and backup.status == ProfileBackupStatus.RESTORING:
                            backup.status = ProfileBackupStatus.FAILED
                            backup.error_message = f"Délai d'attente dépassé ({timeout_seconds}s)"
                except Exception as e:
                    logger.error(f"Error syncing profile backup timeout for target {target.id}: {e}")

        if has_changes:
            await session.commit()


from app.services.deployment_service import DeploymentService


async def check_scheduled_and_recurring_deployments():
    """
    Vérifie et déclenche les déploiements programmés ou récurrents échus (next_run_at <= now).
    """
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(Deployment).where(
                Deployment.status.in_([DeploymentStatus.PENDING, DeploymentStatus.RUNNING]),
                Deployment.next_run_at != None,
                Deployment.next_run_at <= now
            )
        )
        due_deployments = result.scalars().all()
        if due_deployments:
            service = DeploymentService(session)
            for dep in due_deployments:
                logger.info(f"Triggering scheduled/recurring run for deployment '{dep.name}' ({dep.id}) [Type: {dep.schedule_type}]")
                try:
                    await service.trigger_scheduled_run(dep)
                except Exception as e:
                    logger.error(f"Error triggering scheduled deployment {dep.id}: {e}")


async def run_worker_loop():
    logger.info("Starting MAPT background worker loop (Heartbeats, Timeouts, Scheduler)...")
    while True:
        try:
            await check_device_heartbeats()
            await check_job_timeouts()
            await check_scheduled_and_recurring_deployments()
        except Exception as e:
            logger.error(f"Error in background worker loop: {e}")
        await asyncio.sleep(10)


if __name__ == "__main__":
    asyncio.run(run_worker_loop())
