from datetime import datetime
from typing import Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    user_username: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[UUID] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BulkDeleteAuditLogsRequest(BaseModel):
    log_ids: list[UUID]


class AuditActionCountResponse(BaseModel):
    success: bool
    count: int
    message: str
