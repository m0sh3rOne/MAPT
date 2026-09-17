from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.deployment import (
    DeploymentCreate,
    DeploymentResponse,
    DeploymentTargetResponse,
    JobLogResponse,
    BulkDeleteDeploymentsRequest,
    ActionCountResponse
)
from app.services.deployment_service import DeploymentService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/deployments", tags=["Admin - Déploiements"])


@router.get("", response_model=List[DeploymentResponse])
async def list_deployments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    return await service.get_all_deployments()


@router.post("", response_model=DeploymentResponse)
async def create_deployment(
    dep_in: DeploymentCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    return await service.create_deployment(dep_in, current_user.id, client_ip)


@router.delete("/clear-finished", response_model=ActionCountResponse)
async def clear_finished_deployments(
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    count = await service.clear_finished_deployments(current_user.id, client_ip)
    return ActionCountResponse(
        success=True,
        count=count,
        message=f"{count} job(s) terminé(s) ou annulé(s) ont été supprimés avec succès."
    )


@router.post("/bulk-delete", response_model=ActionCountResponse)
async def bulk_delete_deployments(
    req: BulkDeleteDeploymentsRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    count = await service.bulk_delete_deployments(req.deployment_ids, current_user.id, client_ip)
    return ActionCountResponse(
        success=True,
        count=count,
        message=f"{count} job(s) sélectionné(s) ont été supprimés avec succès."
    )


@router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(
    deployment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    return await service.get_deployment_by_id(deployment_id)


@router.delete("/{deployment_id}", response_model=ActionCountResponse)
async def delete_deployment(
    deployment_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    await service.delete_deployment(deployment_id, current_user.id, client_ip)
    return ActionCountResponse(
        success=True,
        count=1,
        message="Déploiement supprimé avec succès."
    )


@router.get("/{deployment_id}/targets", response_model=List[DeploymentTargetResponse])
async def get_deployment_targets(
    deployment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    return await service.get_deployment_targets(deployment_id)


@router.post("/{deployment_id}/cancel", response_model=DeploymentResponse)
async def cancel_deployment(
    deployment_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    return await service.cancel_deployment(deployment_id, current_user.id, client_ip)


@router.post("/{deployment_id}/targets/{target_id}/retry", response_model=DeploymentTargetResponse)
async def retry_deployment_target(
    deployment_id: UUID,
    target_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    return await service.retry_target(deployment_id, target_id, current_user.id, client_ip)


@router.get("/{deployment_id}/targets/{target_id}/logs", response_model=List[JobLogResponse])
async def get_target_logs(
    deployment_id: UUID,
    target_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeploymentService(db)
    return await service.get_target_logs(target_id)
