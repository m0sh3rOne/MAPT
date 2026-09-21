from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.device import (
    DeviceResponse,
    DeviceInventoryResponse,
    DeviceTargetHistoryResponse,
    WolBatchRequest,
    WolCustomRequest,
    WolResultResponse
)
from app.core.security import UserRole
from app.services.device_service import DeviceService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/devices", tags=["Admin - Machines"])


@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_all_devices()


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_device_by_id(device_id)


@router.get("/{device_id}/inventory", response_model=DeviceInventoryResponse | None)
async def get_device_inventory(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_device_inventory(device_id)


from app.schemas.device import (
    DeviceResponse,
    DeviceInventoryResponse,
    DeviceTargetHistoryResponse,
    ActionCountResponse
)


@router.get("/{device_id}/actions", response_model=List[DeviceTargetHistoryResponse])
async def get_device_actions(
    device_id: UUID,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    dep_repo = DeploymentRepository(db)
    targets = await dep_repo.get_targets_for_device(device_id, limit=limit)
    return [
        DeviceTargetHistoryResponse(
            id=t.id,
            deployment_id=t.deployment_id,
            deployment_name=t.deployment.name if t.deployment else "Action",
            deployment_type=t.deployment.deployment_type if t.deployment else "command",
            custom_command=t.deployment.custom_command if t.deployment else None,
            status=t.status,
            created_at=t.created_at,
            started_at=t.started_at,
            completed_at=t.completed_at,
            exit_code=t.exit_code,
            error_message=t.error_message
        )
        for t in targets
    ]


@router.delete("/{device_id}/actions", response_model=ActionCountResponse)
async def clear_device_actions(
    device_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Efface l'historique de toutes les actions et déploiements sur cette machine.
    """
    dep_repo = DeploymentRepository(db)
    count = await dep_repo.clear_device_actions(device_id)
    await db.commit()
    return ActionCountResponse(
        success=True,
        count=count,
        message=f"{count} action(s) et journaux associés supprimés de l'historique."
    )


@router.delete("/{device_id}/actions/{target_id}", response_model=ActionCountResponse)
async def delete_device_action(
    device_id: UUID,
    target_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Supprime une action spécifique de l'historique de cette machine.
    """
    dep_repo = DeploymentRepository(db)
    deleted = await dep_repo.delete_target_by_id(target_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Action introuvable dans l'historique.")
    await db.commit()
    return ActionCountResponse(
        success=True,
        count=1,
        message="Action supprimée de l'historique."
    )


@router.post("/{device_id}/enable", response_model=DeviceResponse)
async def enable_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.set_device_status(device_id, True, current_user.id, client_ip)


@router.post("/{device_id}/disable", response_model=DeviceResponse)
async def disable_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.set_device_status(device_id, False, current_user.id, client_ip)


@router.delete("/{device_id}")
async def delete_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    await service.delete_device(device_id, current_user.id, client_ip)
    return {"status": "success", "message": "Machine supprimée avec succès."}


@router.post("/{device_id}/wol")
async def wake_device(
    device_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN pour réveiller la machine cible.
    """
    from app.services.wol_service import WolService
    wol_svc = WolService(db)
    return await wol_svc.wake_device(device_id)


@router.post("/wol/batch")
async def wake_devices_batch(
    payload: WolBatchRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN pour réveiller une sélection de machines.
    """
    from app.services.wol_service import WolService
    wol_svc = WolService(db)
    return await wol_svc.wake_devices(payload.device_ids)


@router.post("/wol/custom")
async def wake_custom_mac(
    payload: WolCustomRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
):
    """
    Envoie un paquet magique Wake-on-LAN vers une adresse MAC et adresse de diffusion personnalisées.
    """
    from app.services.wol_service import send_magic_packet
    port = payload.port or 9
    return send_magic_packet(payload.mac_address, broadcast_ip=payload.broadcast_ip, ports=(port,))

