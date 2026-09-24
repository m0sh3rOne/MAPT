import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, BigInteger, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class DeploymentStatus:
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class TargetStatus:
    PENDING = "PENDING"
    OFFERED = "OFFERED"
    ACKED = "ACKED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"
    CANCELLED = "CANCELLED"

    ALL_STATUSES = [PENDING, OFFERED, ACKED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT, CANCELLED]
    TERMINAL_STATUSES = [SUCCEEDED, FAILED, TIMED_OUT, CANCELLED]


class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    deployment_type = Column(String(50), nullable=False)  # package, script, command
    package_version_id = Column(UUID(as_uuid=True), ForeignKey("package_versions.id", ondelete="SET NULL"), nullable=True)
    script_version_id = Column(UUID(as_uuid=True), ForeignKey("script_versions.id", ondelete="SET NULL"), nullable=True)
    custom_command = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default=DeploymentStatus.PENDING, nullable=False)
    
    # Schedule & Recurrence
    is_recurring = Column(Boolean, default=False, nullable=False)
    schedule_type = Column(String(50), default="immediate", nullable=False)  # immediate, once, hourly, daily, weekly, monthly, yearly, cron
    scheduled_at = Column(DateTime(timezone=True), nullable=True)  # Start date/time
    scheduled_time = Column(String(10), nullable=True)  # ex: "08:30"
    scheduled_days_of_week = Column(String(50), nullable=True)  # ex: "1,3,5" (Mon, Wed, Fri)
    interval_value = Column(Integer, nullable=True)  # ex: 2
    interval_unit = Column(String(20), nullable=True)  # hours, days, weeks, months, years
    cron_expression = Column(String(100), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    end_at = Column(DateTime(timezone=True), nullable=True)
    
    # Stored Target configuration for recurring executions
    target_all_devices = Column(Boolean, default=False, nullable=False)
    target_group_ids = Column(JSON, nullable=True)
    target_device_ids = Column(JSON, nullable=True)
    
    # Wake-on-LAN option
    wake_on_lan = Column(Boolean, default=False, nullable=False)

    # Concurrency limit (maximum simultaneous target machines)
    max_concurrency = Column(Integer, default=8, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    package_version = relationship("PackageVersion", back_populates="deployments")
    script_version = relationship("ScriptVersion", back_populates="deployments")
    targets = relationship("DeploymentTarget", back_populates="deployment", cascade="all, delete-orphan")


class DeploymentTarget(Base):
    __tablename__ = "deployment_targets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id = Column(UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default=TargetStatus.PENDING, nullable=False, index=True)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    offered_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    exit_code = Column(BigInteger, nullable=True)
    error_message = Column(Text, nullable=True)

    deployment = relationship("Deployment", back_populates="targets")
    device = relationship("Device", back_populates="deployment_targets")
    logs = relationship("JobLog", back_populates="target", cascade="all, delete-orphan", order_by="JobLog.timestamp")
