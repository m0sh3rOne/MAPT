import os
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Header, Request
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_agent
from app.models.device import Device
from app.services.profile_backup_service import ProfileBackupService
from app.storage.minio import get_file_stream, LOCAL_STORAGE_DIR

router = APIRouter(prefix="/profiles", tags=["Agent - Profils Windows"])


@router.post("/{backup_id}/upload")
async def agent_upload_profile_backup(
    backup_id: UUID,
    file: UploadFile = File(...),
    x_profile_sid: Optional[str] = Header(None, alias="X-Profile-SID"),
    x_profile_sha256: Optional[str] = Header(None, alias="X-Profile-SHA256"),
    x_profile_size: Optional[int] = Header(None, alias="X-Profile-Size"),
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    backup = await service.save_uploaded_backup(
        backup_id=backup_id,
        file=file,
        user_sid=x_profile_sid,
        reported_sha256=x_profile_sha256,
        reported_size=x_profile_size
    )

    return {
        "status": "success",
        "backup_id": str(backup.id),
        "size_bytes": backup.size_bytes,
        "sha256": backup.sha256,
    }


@router.get("/{backup_id}/download")
async def agent_download_profile_backup(
    backup_id: UUID,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = ProfileBackupService(db)
    backup = await service.get_backup_by_id(backup_id)

    try:
        local_path = os.path.join(LOCAL_STORAGE_DIR, backup.storage_key)
        filename = f"{backup.profile_name}.zip"

        if os.path.exists(local_path):
            return FileResponse(
                path=local_path,
                filename=filename,
                media_type="application/zip"
            )

        response = get_file_stream(backup.storage_key)
        def iterfile():
            try:
                for chunk in response.stream(64 * 1024):
                    yield chunk
            finally:
                if hasattr(response, "close"):
                    response.close()
                if hasattr(response, "release_conn"):
                    response.release_conn()

        return StreamingResponse(
            iterfile(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(backup.size_bytes) if backup.size_bytes else ""
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Archive de profil introuvable: {e}")
