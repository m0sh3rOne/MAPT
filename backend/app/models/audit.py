import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class AuditAction:
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_PASSWORD_CHANGED = "USER_PASSWORD_CHANGED"
    USER_DELETED = "USER_DELETED"
    ROLE_CHANGED = "ROLE_CHANGED"
    
    DEVICE_ENROLLED = "DEVICE_ENROLLED"
    DEVICE_APPROVED = "DEVICE_APPROVED"
    DEVICE_UNAPPROVED = "DEVICE_UNAPPROVED"
    DEVICE_DISABLED = "DEVICE_DISABLED"
    DEVICE_ENABLED = "DEVICE_ENABLED"
    DEVICE_DELETED = "DEVICE_DELETED"
    DEVICE_WOL = "DEVICE_WOL"
    DEVICE_RENAMED = "DEVICE_RENAMED"
    
    GROUP_CREATED = "GROUP_CREATED"
    GROUP_UPDATED = "GROUP_UPDATED"
    GROUP_DELETED = "GROUP_DELETED"
    GROUP_WOL = "GROUP_WOL"
    
    PACKAGE_CREATED = "PACKAGE_CREATED"
    PACKAGE_UPDATED = "PACKAGE_UPDATED"
    PACKAGE_VERSION_UPLOADED = "PACKAGE_VERSION_UPLOADED"
    PACKAGE_VERSION_UPDATED = "PACKAGE_VERSION_UPDATED"
    PACKAGE_ARCHIVED = "PACKAGE_ARCHIVED"
    PACKAGE_UPLOAD_FAILED = "PACKAGE_UPLOAD_FAILED"
    
    SCRIPT_CREATED = "SCRIPT_CREATED"
    SCRIPT_VERSION_CREATED = "SCRIPT_VERSION_CREATED"
    SCRIPT_ARCHIVED = "SCRIPT_ARCHIVED"
    
    DEPLOYMENT_CREATED = "DEPLOYMENT_CREATED"
    DEPLOYMENT_CANCELLED = "DEPLOYMENT_CANCELLED"
    DEPLOYMENT_TARGET_RETRY = "DEPLOYMENT_TARGET_RETRY"
    
    MCP_SERVER_TOGGLED = "MCP_SERVER_TOGGLED"
    MCP_SERVER_SETTINGS_UPDATED = "MCP_SERVER_SETTINGS_UPDATED"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    user = relationship("User", back_populates="audit_logs")
