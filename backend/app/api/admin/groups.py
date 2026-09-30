from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.device import DeviceGroupCreate, DeviceGroupResponse, AddDeviceToGroupRequest, WolDeviceRequest
from app.services.group_service import GroupService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/groups", tags=["Admin - Groupes"])


@router.get("", response_model=List[DeviceGroupResponse])
async def list_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    return await service.get_all_groups()


@router.post("", response_model=DeviceGroupResponse)
async def create_group(
    group_in: DeviceGroupCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    client_ip = request.client.host if request.client else None
    return await service.create_group(group_in, current_user.id, client_ip)


@router.get("/{group_id}", response_model=DeviceGroupResponse)
async def get_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    return await service.get_group_by_id(group_id)


@router.put("/{group_id}", response_model=DeviceGroupResponse)
async def update_group(
    group_id: UUID,
    group_in: DeviceGroupCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    client_ip = request.client.host if request.client else None
    return await service.update_group(group_id, group_in, current_user.id, client_ip)


@router.delete("/{group_id}")
async def delete_group(
    group_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    client_ip = request.client.host if request.client else None
    await service.delete_group(group_id, current_user.id, client_ip)
    return {"status": "success", "message": "Groupe supprimé avec succès."}


@router.post("/{group_id}/devices")
async def add_devices_to_group(
    group_id: UUID,
    req: AddDeviceToGroupRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    await service.add_devices_to_group(group_id, req.device_ids)
    return {"status": "success", "message": "Machines ajoutées au groupe."}


@router.put("/{group_id}/devices")
async def set_group_devices(
    group_id: UUID,
    req: AddDeviceToGroupRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    await service.set_group_devices(group_id, req.device_ids)
    return {"status": "success", "message": "Membres du groupe synchronisés avec succès."}


@router.delete("/{group_id}/devices/{device_id}")
async def remove_device_from_group(
    group_id: UUID,
    device_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = GroupService(db)
    await service.remove_device_from_group(group_id, device_id)
    return {"status": "success", "message": "Machine retirée du groupe."}


@router.post("/{group_id}/wol")
async def wake_group_devices(
    group_id: UUID,
    payload: Optional[WolDeviceRequest] = None,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN à l'ensemble des machines du groupe.
    """
    from app.services.wol_service import WolService
    wol_svc = WolService(db)
    b_ip = payload.broadcast_ip if payload else None
    port = payload.port if payload else None
    return await wol_svc.wake_group(group_id, broadcast_ip=b_ip, port=port)


