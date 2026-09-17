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
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(DeploymentTarget).where(
                DeploymentTarget.status == TargetStatus.RUNNING,
                DeploymentTarget.started_at < (now - timedelta(seconds=600))  # 10 min fallback timeout
            )
        )
        timed_out_targets = result.scalars().all()
        for target in timed_out_targets:
            target.status = TargetStatus.TIMED_OUT
            target.completed_at = now
            target.error_message = "Job timed out automatically by system worker"
            logger.warning(f"Target {target.id} timed out.")
        
        if timed_out_targets:
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
