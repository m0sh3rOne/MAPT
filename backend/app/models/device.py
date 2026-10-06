import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_uuid = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    hostname = Column(String(255), nullable=False, index=True)
    previous_hostname = Column(String(255), nullable=True)
    os_name = Column(String(100), nullable=False, default="Windows")
    os_version = Column(String(100), nullable=True)
    os_build = Column(String(50), nullable=True)
    agent_version = Column(String(50), nullable=True)
    ip_address = Column(String(100), nullable=True)
    agent_token = Column(String(255), nullable=True)
    is_approved = Column(Boolean, default=True, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    inventory = relationship("DeviceInventory", back_populates="device", uselist=False, cascade="all, delete-orphan")
    group_memberships = relationship("DeviceGroupMember", back_populates="device", cascade="all, delete-orphan")
    deployment_targets = relationship("DeploymentTarget", back_populates="device", cascade="all, delete-orphan")
