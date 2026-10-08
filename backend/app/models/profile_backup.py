import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, BigInteger, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class ProfileBackupStatus:
    PENDING = "PENDING"
    BACKING_UP = "BACKING_UP"
    READY = "READY"
    RESTORING = "RESTORING"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

    ALL_STATUSES = [PENDING, BACKING_UP, READY, RESTORING, FAILED, CANCELLED]


class UserProfileBackup(Base):
    __tablename__ = "user_profile_backups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_name = Column(String(150), nullable=False, index=True)  # ex: "jdupont" ou "ECOLE\prof01"
    user_sid = Column(String(100), nullable=True)  # ex: "S-1-5-21-..."
    source_device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    source_hostname = Column(String(100), nullable=False)
    source_os = Column(String(100), nullable=True)
    
    storage_key = Column(String(255), nullable=False)  # profiles/{id}/profile.zip
    size_bytes = Column(BigInteger, default=0, nullable=False)
    estimated_size_bytes = Column(BigInteger, default=0, nullable=True)
    sha256 = Column(String(64), nullable=True)
    
    status = Column(String(50), default=ProfileBackupStatus.PENDING, nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    metadata_info = Column(JSON, nullable=True)  # captures folders count, files count, original paths
    
    backup_deployment_id = Column(UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="SET NULL"), nullable=True)
    last_restore_deployment_id = Column(UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    source_device = relationship("Device", foreign_keys=[source_device_id])
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    backup_deployment = relationship("Deployment", foreign_keys=[backup_deployment_id])
    last_restore_deployment = relationship("Deployment", foreign_keys=[last_restore_deployment_id])
