from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import urllib.parse

from app.core.database import get_db
from app.core.security import UserRole
from app.api.deps import get_current_user, require_roles
from app.models.user import User
from app.schemas.profile_backup import (
    ProfileBackupCreateRequest,
    ProfileRestoreRequest,
    ProfileBackupResponse,
    ProfileBackupSummary
)
from app.schemas.deployment import DeploymentResponse
from app.services.profile_backup_service import ProfileBackupService
from app.storage.minio import get_file_stream

router = APIRouter(prefix="/profiles", tags=["Admin - Profiles Backup & Migration"])


@router.get("", response_model=List[ProfileBackupResponse])
async def list_profiles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    items, _ = await service.get_all_backups(skip=skip, limit=limit, search=search, status=status)
    return items


@router.get("/summary", response_model=ProfileBackupSummary)
async def get_profiles_summary(
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    summary_data = await service.get_summary()
    return ProfileBackupSummary(**summary_data)


@router.get("/{backup_id}", response_model=ProfileBackupResponse)
async def get_profile(
    backup_id: UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    return await service.get_backup_by_id(backup_id)


@router.post("/backup", response_model=ProfileBackupResponse)
async def trigger_profile_backup(
    req_in: ProfileBackupCreateRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    
    # Calculate base API url from request
    scheme = request.url.scheme
    host = request.headers.get("host", request.url.netloc)
    base_api_url = f"{scheme}://{host}/api/v1"

    return await service.trigger_backup(
        device_id=req_in.device_id,
        profile_name=req_in.profile_name,
        user=current_user,
        notes=req_in.notes,
        base_api_url=base_api_url
    )


@router.post("/{backup_id}/restore")
async def trigger_profile_restore(
    backup_id: UUID,
    req_in: ProfileRestoreRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)

    scheme = request.url.scheme
    host = request.headers.get("host", request.url.netloc)
    base_api_url = f"{scheme}://{host}/api/v1"

    deployment = await service.trigger_restore(
        backup_id=backup_id,
        target_device_id=req_in.target_device_id,
        target_username=req_in.target_username,
        create_account=req_in.create_local_account,
        overwrite_existing=req_in.overwrite_existing,
        autologon=req_in.autologon,
        autologon_password=req_in.autologon_password,
        user=current_user,
        notes=req_in.notes,
        base_api_url=base_api_url
    )

    return {
        "message": "Ordre de restauration du profil envoyé avec succès.",
        "deployment_id": str(deployment.id),
        "backup_id": str(backup_id),
    }


@router.get("/{backup_id}/download")
async def download_profile_zip(
    backup_id: UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    backup = await service.get_backup_by_id(backup_id)

    try:
        stream = get_file_stream(backup.storage_key)
        encoded_filename = urllib.parse.quote(f"profile_{backup.profile_name}.zip")
        return StreamingResponse(
            stream,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(backup.size_bytes) if backup.size_bytes else ""
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Fichier de profil introuvable sur le stockage: {e}")


@router.get("/storage-check")
async def check_server_storage(
    estimated_size_bytes: int = Query(0, ge=0),
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    return service.check_storage(estimated_size_bytes=estimated_size_bytes)


@router.post("/{backup_id}/cancel", response_model=ProfileBackupResponse)
async def cancel_profile_backup(
    backup_id: UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    return await service.cancel_backup(backup_id, current_user)


@router.delete("/{backup_id}")
async def delete_profile_backup(
    backup_id: UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    success = await service.delete_backup(backup_id, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable ou déjà supprimée.")
    return {"message": "Sauvegarde de profil supprimée avec succès."}
