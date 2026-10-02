from typing import List, Optional, Set, Union
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
from app.models.job import JobLog
from app.models.audit import AuditAction
from app.models.user import User
from app.core.security import UserRole
from app.repositories.deployment_repository import DeploymentRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.device_repository import DeviceRepository
from app.repositories.package_repository import PackageRepository
from app.repositories.script_repository import ScriptRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.deployment import DeploymentCreate, DeploymentResponse, DeploymentTargetResponse, JobLogResponse
from app.core.scheduler import compute_next_run


class DeploymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.dep_repo = DeploymentRepository(db)
        self.group_repo = GroupRepository(db)
        self.device_repo = DeviceRepository(db)
        self.pkg_repo = PackageRepository(db)
        self.script_repo = ScriptRepository(db)
        self.audit_repo = AuditRepository(db)

    def _map_to_response(self, dep: Deployment) -> DeploymentResponse:
        targets = dep.targets or []
        total = len(targets)
        succeeded = sum(1 for t in targets if t.status == TargetStatus.SUCCEEDED)
        failed = sum(1 for t in targets if t.status in [TargetStatus.FAILED, TargetStatus.TIMED_OUT])
        running = sum(1 for t in targets if t.status in [TargetStatus.RUNNING, TargetStatus.ACKED, TargetStatus.OFFERED])
        pending = sum(1 for t in targets if t.status == TargetStatus.PENDING)

        status = dep.status
        if not dep.is_recurring and total > 0 and (succeeded + failed) == total and status in [DeploymentStatus.RUNNING, DeploymentStatus.PENDING]:
            status = DeploymentStatus.COMPLETED

        return DeploymentResponse(
            id=dep.id,
            name=dep.name,
            description=dep.description,
            deployment_type=dep.deployment_type,
            status=status,
            package_version_id=dep.package_version_id,
            script_version_id=dep.script_version_id,
            custom_command=dep.custom_command,
            created_by=dep.created_by,
            wake_on_lan=getattr(dep, "wake_on_lan", False),
            max_concurrency=getattr(dep, "max_concurrency", 8) if getattr(dep, "max_concurrency", None) is not None else 8,
            is_recurring=dep.is_recurring,
            schedule_type=dep.schedule_type or "immediate",
            scheduled_at=dep.scheduled_at,
            scheduled_time=dep.scheduled_time,
            scheduled_days_of_week=dep.scheduled_days_of_week,
            interval_value=dep.interval_value,
            interval_unit=dep.interval_unit,
            cron_expression=dep.cron_expression,
            next_run_at=dep.next_run_at,
            last_run_at=dep.last_run_at,
            end_at=dep.end_at,
            target_all_devices=dep.target_all_devices,
            target_device_ids=dep.target_device_ids or [],
            target_group_ids=dep.target_group_ids or [],
            created_at=dep.created_at,
            started_at=dep.started_at,
            completed_at=dep.completed_at,
            total_targets=total,
            succeeded_targets=succeeded,
            failed_targets=failed,
            running_targets=running,
            pending_targets=pending
        )

    def _map_target_to_response(self, target: DeploymentTarget) -> DeploymentTargetResponse:
        return DeploymentTargetResponse(
            id=target.id,
            deployment_id=target.deployment_id,
            device_id=target.device_id,
            device_hostname=target.device.hostname if target.device else None,
            device_ip=target.device.ip_address if target.device else None,
            status=target.status,
            retry_count=target.retry_count,
            max_retries=target.max_retries,
            created_at=target.created_at,
            offered_at=target.offered_at,
            acknowledged_at=target.acknowledged_at,
            started_at=target.started_at,
            completed_at=target.completed_at,
            exit_code=target.exit_code,
            error_message=target.error_message
        )

    async def get_all_deployments(self) -> List[DeploymentResponse]:
        deployments = await self.dep_repo.get_all()
        return [self._map_to_response(d) for d in deployments]

    async def get_deployment_by_id(self, deployment_id: UUID) -> DeploymentResponse:
        dep = await self.dep_repo.get_by_id(deployment_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Déploiement introuvable.")
        return self._map_to_response(dep)

    async def get_deployment_targets(self, deployment_id: UUID) -> List[DeploymentTargetResponse]:
        dep = await self.dep_repo.get_by_id(deployment_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Déploiement introuvable.")
        return [self._map_target_to_response(t) for t in dep.targets]

    async def create_deployment(
        self,
        dep_in: DeploymentCreate,
        user_or_id: Union[User, UUID],
        ip_address: Optional[str] = None
    ) -> DeploymentResponse:
        user_id = user_or_id.id if isinstance(user_or_id, User) else user_or_id
        user_role = user_or_id.role if isinstance(user_or_id, User) else None

        # Contrôle des droits Opérateur : assignation obligatoire au groupe / machines
        if user_role == UserRole.OPERATOR:
            if dep_in.target_all_devices:
                raise HTTPException(
                    status_code=403,
                    detail="En tant qu'opérateur, vous n'êtes pas autorisé à cibler l'ensemble du parc de machines."
                )
            assigned_group_ids = set(await self.group_repo.get_operator_group_ids(user_id))
            assigned_device_ids = await self.group_repo.get_operator_device_ids(user_id)

            if dep_in.target_group_ids:
                for gid in dep_in.target_group_ids:
                    if gid not in assigned_group_ids:
                        raise HTTPException(
                            status_code=403,
                            detail="Accès refusé : vous n'êtes pas assigné à ce groupe en tant qu'opérateur."
                        )

            if dep_in.target_device_ids:
                for did in dep_in.target_device_ids:
                    if did not in assigned_device_ids:
                        raise HTTPException(
                            status_code=403,
                            detail="Accès refusé : cette machine n'appartient à aucun des groupes qui vous sont assignés."
                        )

        # Résolution des cibles
        target_device_ids: Set[UUID] = set(dep_in.target_device_ids)
        if dep_in.target_all_devices:
            all_devs = await self.device_repo.get_all()
            target_device_ids.update(d.id for d in all_devs)
        for group_id in dep_in.target_group_ids:
            group_devs = await self.group_repo.get_group_device_ids(group_id)
            target_device_ids.update(group_devs)

        if not target_device_ids:
            raise HTTPException(status_code=400, detail="Au moins une machine ou un groupe cible doit être spécifié.")


        # Validation de la version selon le type
        if dep_in.deployment_type == "package":
            if not dep_in.package_version_id:
                raise HTTPException(status_code=400, detail="package_version_id requis pour un déploiement de package.")
            pkg_v = await self.pkg_repo.get_version_by_id(dep_in.package_version_id)
            if not pkg_v:
                raise HTTPException(status_code=404, detail="Version de package introuvable.")
        elif dep_in.deployment_type in ["script", "powershell", "python", "vbscript", "vbs", "cmd", "batch"]:
            if not dep_in.script_version_id:
                raise HTTPException(status_code=400, detail="script_version_id requis pour un déploiement de script.")
            script_v = await self.script_repo.get_version_by_id(dep_in.script_version_id)
            if not script_v:
                raise HTTPException(status_code=404, detail="Version de script introuvable.")
        elif dep_in.deployment_type == "command":
            if not dep_in.custom_command:
                raise HTTPException(status_code=400, detail="custom_command requis pour une commande directe.")

        # Calcul de la prochaine exécution
        now = datetime.now(timezone.utc)
        next_run = compute_next_run(
            schedule_type=dep_in.schedule_type,
            scheduled_at=dep_in.scheduled_at,
            scheduled_time=dep_in.scheduled_time,
            scheduled_days_of_week=dep_in.scheduled_days_of_week,
            interval_value=dep_in.interval_value,
            interval_unit=dep_in.interval_unit,
            cron_expression=dep_in.cron_expression,
            from_time=now
        )

        is_immediate = dep_in.schedule_type == "immediate" or (next_run and next_run <= now)
        initial_status = DeploymentStatus.RUNNING if is_immediate else DeploymentStatus.PENDING
        initial_last_run = now if is_immediate else None

        if is_immediate:
            if dep_in.is_recurring:
                # Si récurrent exécuté immédiatement, calculer la prochaine itération future
                initial_next_run = compute_next_run(
                    schedule_type=dep_in.schedule_type,
                    scheduled_at=dep_in.scheduled_at,
                    scheduled_time=dep_in.scheduled_time,
                    scheduled_days_of_week=dep_in.scheduled_days_of_week,
                    interval_value=dep_in.interval_value,
                    interval_unit=dep_in.interval_unit,
                    cron_expression=dep_in.cron_expression,
                    from_time=now + timedelta(seconds=2)
                )
            else:
                # Déploiement unique immédiat : next_run_at DOIT être None pour que le worker d'arrière-plan ne le réexécute pas
                initial_next_run = None
        else:
            initial_next_run = next_run

        deployment = Deployment(
            name=dep_in.name,
            description=dep_in.description,
            deployment_type=dep_in.deployment_type,
            package_version_id=dep_in.package_version_id,
            script_version_id=dep_in.script_version_id,
            custom_command=dep_in.custom_command,
            created_by=user_id,
            status=initial_status,
            last_run_at=initial_last_run,
            is_recurring=dep_in.is_recurring,
            schedule_type=dep_in.schedule_type,
            scheduled_at=dep_in.scheduled_at,
            scheduled_time=dep_in.scheduled_time,
            scheduled_days_of_week=dep_in.scheduled_days_of_week,
            interval_value=dep_in.interval_value,
            interval_unit=dep_in.interval_unit,
            cron_expression=dep_in.cron_expression,
            next_run_at=initial_next_run,
            end_at=dep_in.end_at,
            wake_on_lan=dep_in.wake_on_lan,
            max_concurrency=dep_in.max_concurrency if dep_in.max_concurrency is not None else 8,
            target_all_devices=dep_in.target_all_devices,
            target_group_ids=[str(g) for g in dep_in.target_group_ids],
            target_device_ids=[str(d) for d in dep_in.target_device_ids],
        )
        created = await self.dep_repo.create(deployment)

        # Si exécution immédiate, créer les cibles initiales
        if is_immediate:
            for dev_id in target_device_ids:
                target = DeploymentTarget(
                    deployment_id=created.id,
                    device_id=dev_id,
                    status=TargetStatus.PENDING
                )
                self.db.add(target)
            await self.db.flush()

            # Si Wake-on-LAN activé, envoyer un paquet magique à toutes les machines cibles
            if dep_in.wake_on_lan:
                try:
                    from app.services.wol_service import WolService
                    wol_svc = WolService(self.db)
                    await wol_svc.wake_devices(list(target_device_ids), user_id=user_id, ip_address=ip_address)
                except Exception as e:
                    from app.core.logging import logger
                    logger.warning(f"Échec envoi Wake-on-LAN pour le déploiement {created.id}: {e}")

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CREATED,
            entity_type="deployment",
            user_id=user_id,
            entity_id=created.id,
            details={
                "name": created.name,
                "type": created.deployment_type,
                "is_recurring": created.is_recurring,
                "wake_on_lan": created.wake_on_lan,
                "schedule_type": created.schedule_type,
                "next_run_at": created.next_run_at.isoformat() if created.next_run_at else None,
                "targets_count": len(target_device_ids)
            },
            ip_address=ip_address
        )

        return await self.get_deployment_by_id(created.id)

    async def trigger_scheduled_run(self, deployment: Deployment) -> None:
        """
        Déclenche une itération de déploiement planifié ou récurrent
        """
        now = datetime.now(timezone.utc)
        target_device_ids: Set[UUID] = set()

        if deployment.target_all_devices:
            all_devs = await self.device_repo.get_all()
            target_device_ids.update(d.id for d in all_devs)
        if deployment.target_group_ids:
            for g_id in deployment.target_group_ids:
                try:
                    g_devs = await self.group_repo.get_group_device_ids(UUID(g_id))
                    target_device_ids.update(g_devs)
                except Exception:
                    pass
        if deployment.target_device_ids:
            for d_id in deployment.target_device_ids:
                try:
                    target_device_ids.add(UUID(d_id))
                except Exception:
                    pass

        # Si Wake-on-LAN activé, envoyer un paquet magique à toutes les machines cibles
        if getattr(deployment, "wake_on_lan", False):
            try:
                from app.services.wol_service import WolService
                wol_svc = WolService(self.db)
                await wol_svc.wake_devices(list(target_device_ids))
            except Exception as e:
                from app.core.logging import logger
                logger.warning(f"Échec envoi Wake-on-LAN planifié pour le déploiement {deployment.id}: {e}")

        # Créer les cibles pour cette itération en évitant les cibles actives en double
        for dev_id in target_device_ids:
            has_active_target = False
            if deployment.targets:
                for t in deployment.targets:
                    if t.device_id == dev_id and t.status in [TargetStatus.PENDING, TargetStatus.OFFERED, TargetStatus.RUNNING]:
                        has_active_target = True
                        break
            if not has_active_target:
                target = DeploymentTarget(
                    deployment_id=deployment.id,
                    device_id=dev_id,
                    status=TargetStatus.PENDING
                )
                self.db.add(target)

        deployment.last_run_at = now
        deployment.status = DeploymentStatus.RUNNING

        if deployment.is_recurring:
            # Calculer la prochaine itération future
            next_run = compute_next_run(
                schedule_type=deployment.schedule_type,
                scheduled_at=deployment.scheduled_at,
                scheduled_time=deployment.scheduled_time,
                scheduled_days_of_week=deployment.scheduled_days_of_week,
                interval_value=deployment.interval_value,
                interval_unit=deployment.interval_unit,
                cron_expression=deployment.cron_expression,
                from_time=now + timedelta(seconds=2)
            )
            deployment.next_run_at = next_run
            if deployment.end_at and now >= deployment.end_at:
                deployment.status = DeploymentStatus.COMPLETED
                deployment.next_run_at = None
        else:
            deployment.next_run_at = None

        await self.db.commit()

    async def cancel_deployment(self, deployment_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> DeploymentResponse:
        dep = await self.dep_repo.get_by_id(deployment_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Déploiement introuvable.")

        dep.status = DeploymentStatus.CANCELLED
        dep.completed_at = datetime.now(timezone.utc)
        for t in dep.targets:
            if t.status in [TargetStatus.PENDING, TargetStatus.OFFERED, TargetStatus.ACKED, TargetStatus.RUNNING]:
                t.status = TargetStatus.CANCELLED
                t.completed_at = datetime.now(timezone.utc)
                t.error_message = "Tâche interrompue manuellement par l'administrateur"

        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CANCELLED,
            entity_type="deployment",
            user_id=user_id,
            entity_id=deployment_id,
            details={"name": dep.name},
            ip_address=ip_address
        )
        return self._map_to_response(dep)

    async def cancel_target(self, deployment_id: UUID, target_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> DeploymentTargetResponse:
        target = await self.dep_repo.get_target_by_id(target_id)
        if not target or target.deployment_id != deployment_id:
            raise HTTPException(status_code=404, detail="Cible de déploiement introuvable.")

        target.status = TargetStatus.CANCELLED
        target.completed_at = datetime.now(timezone.utc)
        target.error_message = "Tâche interrompue manuellement par l'administrateur"

        dep = await self.dep_repo.get_by_id(deployment_id)
        if dep:
            active_targets = [
                t for t in dep.targets
                if t.id != target.id and t.status in [TargetStatus.PENDING, TargetStatus.OFFERED, TargetStatus.ACKED, TargetStatus.RUNNING]
            ]
            if not active_targets:
                dep.status = DeploymentStatus.CANCELLED
                dep.completed_at = datetime.now(timezone.utc)

        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CANCELLED,
            entity_type="deployment_target",
            user_id=user_id,
            entity_id=target.id,
            details={"deployment_id": str(deployment_id), "device_id": str(target.device_id), "action": "cancel_target"},
            ip_address=ip_address
        )
        return self._map_target_to_response(target)

    async def retry_target(self, deployment_id: UUID, target_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> DeploymentTargetResponse:
        target = await self.dep_repo.get_target_by_id(target_id)
        if not target or target.deployment_id != deployment_id:
            raise HTTPException(status_code=404, detail="Cible de déploiement introuvable.")

        target.status = TargetStatus.PENDING
        target.retry_count += 1
        target.offered_at = None
        target.acknowledged_at = None
        target.started_at = None
        target.completed_at = None
        target.exit_code = None
        target.error_message = None

        if target.deployment.status == DeploymentStatus.COMPLETED:
            target.deployment.status = DeploymentStatus.RUNNING
            target.deployment.completed_at = None

        await self.db.flush()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_TARGET_RETRY,
            entity_type="deployment_target",
            user_id=user_id,
            entity_id=target.id,
            details={"deployment_id": str(deployment_id), "device_id": str(target.device_id), "retry_count": target.retry_count},
            ip_address=ip_address
        )
        return self._map_target_to_response(target)

    async def get_target_logs(self, target_id: UUID) -> List[JobLogResponse]:
        logs = await self.dep_repo.get_target_logs(target_id)
        return [JobLogResponse.model_validate(l) for l in logs]

    async def delete_deployment(self, deployment_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> bool:
        dep = await self.dep_repo.get_by_id(deployment_id)
        if not dep:
            raise HTTPException(status_code=404, detail="Déploiement introuvable.")

        dep_name = dep.name
        await self.dep_repo.delete(dep)
        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CANCELLED,
            entity_type="deployment",
            user_id=user_id,
            entity_id=deployment_id,
            details={"name": dep_name, "action": "deleted"},
            ip_address=ip_address
        )
        return True

    async def clear_finished_deployments(self, user_id: UUID, ip_address: Optional[str] = None) -> int:
        deleted_count = await self.dep_repo.clear_finished()
        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CANCELLED,
            entity_type="deployment",
            user_id=user_id,
            entity_id=None,
            details={"action": "clear_finished", "count": deleted_count},
            ip_address=ip_address
        )
        return deleted_count

    async def bulk_delete_deployments(self, deployment_ids: List[UUID], user_id: UUID, ip_address: Optional[str] = None) -> int:
        deleted_count = await self.dep_repo.delete_bulk(deployment_ids)
        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CANCELLED,
            entity_type="deployment",
            user_id=user_id,
            entity_id=None,
            details={"action": "bulk_delete", "count": deleted_count, "ids": [str(i) for i in deployment_ids]},
            ip_address=ip_address
        )
        return deleted_count
