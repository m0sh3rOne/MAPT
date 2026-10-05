import io
import os
import hashlib
from typing import Tuple, BinaryIO
from minio import Minio
from minio.error import S3Error
from app.core.config import settings
from app.core.logging import logger

minio_client = Minio(
    settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_SECURE,
)

LOCAL_STORAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../storage_data"))
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)


def ensure_bucket_exists():
    try:
        if not minio_client.bucket_exists(settings.MINIO_BUCKET_NAME):
            minio_client.make_bucket(settings.MINIO_BUCKET_NAME)
            logger.info(f"MinIO bucket '{settings.MINIO_BUCKET_NAME}' created.")
    except Exception as e:
        logger.warning(f"Unable to verify/create MinIO bucket: {e}. Fallback to local storage enabled.")


def upload_file_bytes(data: bytes, filename: str, content_type: str = "application/octet-stream") -> Tuple[str, str, int]:
    """
    Calcule le SHA256, upload vers MinIO (ou stockage local si MinIO indisponible) et retourne (storage_key, sha256, size_bytes)
    """
    sha256_hash = hashlib.sha256(data).hexdigest()
    size_bytes = len(data)
    storage_key = f"packages/{sha256_hash}/{filename}"

    # Sauvegarde locale de secours garantie
    local_path = os.path.join(LOCAL_STORAGE_DIR, storage_key)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(data)

    # Tentative d'upload MinIO
    try:
        ensure_bucket_exists()
        data_stream = io.BytesIO(data)
        minio_client.put_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=storage_key,
            data=data_stream,
            length=size_bytes,
            content_type=content_type
        )
        logger.info(f"File '{filename}' stored in MinIO ({storage_key})")
    except Exception as e:
        logger.warning(f"MinIO upload skipped/failed ({e}), using local file at '{local_path}'.")

    return storage_key, sha256_hash, size_bytes


def get_file_stream(storage_key: str):
    """
    Récupère un flux de données pour le téléchargement depuis MinIO ou le stockage local
    """
    try:
        return minio_client.get_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=storage_key
        )
    except Exception:
        local_path = os.path.join(LOCAL_STORAGE_DIR, storage_key)
        if os.path.exists(local_path):
            return open(local_path, "rb")
        raise


def get_file_bytes(storage_key: str) -> bytes:
    """
    Récupère l'intégralité des octets d'un fichier stocké (disque local ou MinIO)
    """
    local_path = os.path.join(LOCAL_STORAGE_DIR, storage_key)
    if os.path.exists(local_path):
        with open(local_path, "rb") as f:
            return f.read()

    try:
        resp = minio_client.get_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=storage_key
        )
        data = resp.read()
        resp.close()
        resp.release_conn()
        return data
    except Exception as e:
        logger.error(f"Erreur lors de la lecture des octets pour {storage_key}: {e}")
        raise
