from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from pydantic import BaseModel


class ProfileBackupCreateRequest(BaseModel):
    device_id: UUID
    profile_name: str  # ex: "jdupont" ou "ECOLE\prof01"
    notes: Optional[str] = None
    compression_level: Optional[str] = "optimal"  # "fastest", "optimal", "maximum"


class ProfileRestoreRequest(BaseModel):
    target_device_id: UUID
    target_username: Optional[str] = None  # Si None, utilise le profile_name original
    create_local_account: bool = True
    overwrite_existing: bool = True
    autologon: bool = True
    autologon_password: Optional[str] = None
    notes: Optional[str] = None


class ProfileBackupResponse(BaseModel):
    id: UUID
    profile_name: str
    user_sid: Optional[str] = None
    source_device_id: Optional[UUID] = None
    source_hostname: str
    source_os: Optional[str] = None
    storage_key: str
    size_bytes: int
    estimated_size_bytes: Optional[int] = 0
    sha256: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    notes: Optional[str] = None
    metadata_info: Optional[Dict[str, Any]] = None
    backup_deployment_id: Optional[UUID] = None
    last_restore_deployment_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    created_by_user_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class ProfileBackupSummary(BaseModel):
    total_profiles: int
    total_size_bytes: int
    ready_count: int
    in_progress_count: int
    failed_count: int
    server_free_space_bytes: Optional[int] = 0
    server_total_space_bytes: Optional[int] = 0
