import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, FileResponse
from app.storage.minio import get_file_stream, LOCAL_STORAGE_DIR
from app.api.deps import get_current_agent
from app.models.device import Device

router = APIRouter(tags=["Agent - Téléchargement"])


@router.get("/packages/download/{storage_key:path}")
async def download_package_file(
    storage_key: str,
    device: Device = Depends(get_current_agent)
):
    try:
        filename = storage_key.split("/")[-1]
        local_path = os.path.join(LOCAL_STORAGE_DIR, storage_key)
        
        # Si le fichier est présent sur le stockage disque local
        if os.path.exists(local_path):
            return FileResponse(
                path=local_path,
                filename=filename,
                media_type="application/octet-stream"
            )

        # Sinon stream depuis MinIO
        response = get_file_stream(storage_key)
        def iterfile():
            try:
                for chunk in response.stream(32 * 1024):
                    yield chunk
            finally:
                if hasattr(response, "close"):
                    response.close()
                if hasattr(response, "release_conn"):
                    response.release_conn()

        return StreamingResponse(
            iterfile(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Fichier introuvable sur le stockage: {str(e)}")
