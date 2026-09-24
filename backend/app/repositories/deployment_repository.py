from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, or_
from sqlalchemy.orm import selectinload
from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
from app.models.package import Package, PackageVersion
from app.models.script import Script, ScriptVersion
from app.models.job import JobLog
from app.models.device import Device


class DeploymentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, deployment_id: UUID) -> Optional[Deployment]:
        result = await self.db.execute(
            select(Deployment)
            .options(
                selectinload(Deployment.targets).selectinload(DeploymentTarget.device),
                selectinload(Deployment.package_version).selectinload(PackageVersion.package),
                selectinload(Deployment.script_version).selectinload(ScriptVersion.script)
            )
            .where(Deployment.id == deployment_id)
        )
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[Deployment]:
        result = await self.db.execute(
            select(Deployment)
            .options(
                selectinload(Deployment.targets).selectinload(DeploymentTarget.device),
                selectinload(Deployment.package_version).selectinload(PackageVersion.package),
                selectinload(Deployment.script_version).selectinload(ScriptVersion.script)
            )
            .order_by(Deployment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, deployment: Deployment) -> Deployment:
        self.db.add(deployment)
        await self.db.flush()
        await self.db.refresh(deployment)
        return deployment

    async def get_target_by_id(self, target_id: UUID) -> Optional[DeploymentTarget]:
        result = await self.db.execute(
            select(DeploymentTarget)
            .options(
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.package_version).selectinload(PackageVersion.package),
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.script_version).selectinload(ScriptVersion.script),
                selectinload(DeploymentTarget.device),
                selectinload(DeploymentTarget.logs)
            )
            .where(DeploymentTarget.id == target_id)
        )
        return result.scalar_one_or_none()

    async def get_pending_targets_for_device(self, device_id: UUID) -> List[DeploymentTarget]:
        """
        Récupère les jobs en attente (PENDING ou OFFERED) pour un agent spécifique
        en tenant compte de l'heure programmée (scheduled_at).
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(DeploymentTarget)
            .options(
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.package_version).selectinload(PackageVersion.package),
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.script_version).selectinload(ScriptVersion.script),
                selectinload(DeploymentTarget.device)
            )
            .join(Deployment, DeploymentTarget.deployment_id == Deployment.id)
            .where(
                DeploymentTarget.device_id == device_id,
                DeploymentTarget.status.in_([TargetStatus.PENDING, TargetStatus.OFFERED]),
                Deployment.status != DeploymentStatus.CANCELLED,
                or_(Deployment.scheduled_at == None, Deployment.scheduled_at <= now)
            )
            .order_by(DeploymentTarget.created_at)
        )
        return list(result.scalars().all())

    async def get_active_targets_count_for_deployment(self, deployment_id: UUID) -> int:
        """
        Compte le nombre de cibles actuellement actives (OFFERED, ACKED, RUNNING)
        pour un déploiement donné, afin de réguler la concurrence.
        """
        result = await self.db.execute(
            select(func.count(DeploymentTarget.id))
            .where(
                DeploymentTarget.deployment_id == deployment_id,
                DeploymentTarget.status.in_([TargetStatus.OFFERED, TargetStatus.ACKED, TargetStatus.RUNNING])
            )
        )
        return result.scalar() or 0

    async def update_target_status(
        self,
        target_id: UUID,
        status: str,
        exit_code: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> Optional[DeploymentTarget]:
        target = await self.get_target_by_id(target_id)
        if not target:
            return None

        now = datetime.now(timezone.utc)
        target.status = status

        if status == TargetStatus.OFFERED and not target.offered_at:
            target.offered_at = now
        elif status == TargetStatus.ACKED:
            target.acknowledged_at = now
        elif status == TargetStatus.RUNNING:
            if not target.started_at:
                target.started_at = now
            # Mettre également à jour le statut du parent
            if target.deployment and target.deployment.status == DeploymentStatus.PENDING:
                target.deployment.status = DeploymentStatus.RUNNING
                target.deployment.started_at = now
        elif status in TargetStatus.TERMINAL_STATUSES:
            target.completed_at = now
            if exit_code is not None:
                target.exit_code = exit_code
            if error_message is not None:
                target.error_message = error_message

        # Flush la cible modifiée dans la transaction
        await self.db.flush()

        if status in TargetStatus.TERMINAL_STATUSES:
            # Vérifier si toutes les cibles du déploiement sont terminées
            await self._check_deployment_completion(target.deployment_id)
            await self.db.flush()

        return target

    async def _check_deployment_completion(self, deployment_id: UUID):
        result = await self.db.execute(
            select(DeploymentTarget.status)
            .where(DeploymentTarget.deployment_id == deployment_id)
        )
        statuses = [s for (s,) in result.all()]
        if statuses and all(s in TargetStatus.TERMINAL_STATUSES for s in statuses):
            dep = await self.get_by_id(deployment_id)
            if dep:
                dep.status = DeploymentStatus.COMPLETED
                if not dep.completed_at:
                    dep.completed_at = datetime.now(timezone.utc)
            else:
                await self.db.execute(
                    update(Deployment)
                    .where(Deployment.id == deployment_id)
                    .values(
                        status=DeploymentStatus.COMPLETED,
                        completed_at=datetime.now(timezone.utc)
                    )
                )

    async def add_target_log(self, target_id: UUID, level: str, message: str, timestamp: Optional[datetime] = None) -> JobLog:
        log = JobLog(
            deployment_target_id=target_id,
            level=level,
            message=message,
            timestamp=timestamp or datetime.now(timezone.utc)
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def get_target_logs(self, target_id: UUID) -> List[JobLog]:
        result = await self.db.execute(
            select(JobLog)
            .where(JobLog.deployment_target_id == target_id)
            .order_by(JobLog.timestamp)
        )
        return list(result.scalars().all())

    async def delete(self, deployment: Deployment) -> None:
        await self.db.delete(deployment)
        await self.db.flush()

    async def delete_by_id(self, deployment_id: UUID) -> bool:
        dep = await self.get_by_id(deployment_id)
        if dep:
            await self.db.delete(dep)
            await self.db.flush()
            return True
        return False

    async def clear_finished(self) -> int:
        result = await self.db.execute(
            select(Deployment)
            .options(selectinload(Deployment.targets))
            .where(Deployment.status.in_([DeploymentStatus.COMPLETED, DeploymentStatus.CANCELLED]))
        )
        finished_deps = list(result.scalars().all())
        count = len(finished_deps)
        for dep in finished_deps:
            await self.db.delete(dep)
        await self.db.flush()
        return count

    async def delete_bulk(self, deployment_ids: List[UUID]) -> int:
        result = await self.db.execute(
            select(Deployment)
            .options(selectinload(Deployment.targets))
            .where(Deployment.id.in_(deployment_ids))
        )
        deps = list(result.scalars().all())
        count = len(deps)
        for dep in deps:
            await self.db.delete(dep)
        await self.db.flush()
        return count

    async def get_targets_for_device(self, device_id: UUID, limit: int = 50) -> List[DeploymentTarget]:
        result = await self.db.execute(
            select(DeploymentTarget)
            .options(
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.package_version).selectinload(PackageVersion.package),
                selectinload(DeploymentTarget.deployment).selectinload(Deployment.script_version).selectinload(ScriptVersion.script),
                selectinload(DeploymentTarget.device),
                selectinload(DeploymentTarget.logs)
            )
            .where(DeploymentTarget.device_id == device_id)
            .order_by(DeploymentTarget.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def clear_device_actions(self, device_id: UUID) -> int:
        result = await self.db.execute(
            select(DeploymentTarget)
            .options(selectinload(DeploymentTarget.logs))
            .where(DeploymentTarget.device_id == device_id)
        )
        targets = list(result.scalars().all())
        count = len(targets)
        for target in targets:
            await self.db.delete(target)
        await self.db.flush()
        return count

    async def delete_target_by_id(self, target_id: UUID) -> bool:
        result = await self.db.execute(
            select(DeploymentTarget)
            .options(selectinload(DeploymentTarget.logs))
            .where(DeploymentTarget.id == target_id)
        )
        target = result.scalar_one_or_none()
        if target:
            await self.db.delete(target)
            await self.db.flush()
            return True
        return False


