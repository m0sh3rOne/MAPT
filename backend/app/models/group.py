import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class DeviceGroup(Base):
    __tablename__ = "device_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    members = relationship("DeviceGroupMember", back_populates="group", cascade="all, delete-orphan")
    operators = relationship("DeviceGroupOperator", back_populates="group", cascade="all, delete-orphan")


class DeviceGroupMember(Base):
    __tablename__ = "device_group_members"

    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("device_groups.id", ondelete="CASCADE"), primary_key=True)
    added_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    device = relationship("Device", back_populates="group_memberships")
    group = relationship("DeviceGroup", back_populates="members")


class DeviceGroupOperator(Base):
    __tablename__ = "device_group_operators"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("device_groups.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")
    group = relationship("DeviceGroup", back_populates="operators")

