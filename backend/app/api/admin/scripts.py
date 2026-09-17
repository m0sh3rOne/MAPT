from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.package import ScriptCreate, ScriptResponse, ScriptVersionResponse, ScriptVersionCreate
from app.services.script_service import ScriptService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/scripts", tags=["Admin - Scripts"])


@router.get("", response_model=List[ScriptResponse])
async def list_scripts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    return await service.get_all_scripts()


@router.post("", response_model=ScriptResponse)
async def create_script(
    script_in: ScriptCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    client_ip = request.client.host if request.client else None
    return await service.create_script(script_in, current_user.id, client_ip)


@router.get("/{script_id}", response_model=ScriptResponse)
async def get_script(
    script_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    return await service.get_script_by_id(script_id)


@router.get("/{script_id}/versions", response_model=List[ScriptVersionResponse])
async def get_script_versions(
    script_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    return await service.get_versions(script_id)


@router.post("/{script_id}/versions", response_model=ScriptVersionResponse)
async def add_script_version(
    script_id: UUID,
    version_in: ScriptVersionCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    client_ip = request.client.host if request.client else None
    return await service.add_script_version(script_id, version_in, current_user.id, client_ip)


@router.delete("/{script_id}")
async def delete_script(
    script_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ScriptService(db)
    client_ip = request.client.host if request.client else None
    await service.delete_script(script_id, current_user.id, client_ip)
    return {"message": "Script supprimé avec succès."}
