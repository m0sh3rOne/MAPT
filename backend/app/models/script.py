import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Script(Base):
    __tablename__ = "scripts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    language = Column(String(50), nullable=False, default="powershell")  # powershell, python, cmd
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    archived = Column(Boolean, default=False, nullable=False)

    versions = relationship("ScriptVersion", back_populates="script", cascade="all, delete-orphan", order_by="desc(ScriptVersion.version)")


class ScriptVersion(Base):
    __tablename__ = "script_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    script_id = Column(UUID(as_uuid=True), ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)  # 1, 2, 3...
    content = Column(Text, nullable=False)
    sha256 = Column(String(64), nullable=False)
    timeout_seconds = Column(Integer, nullable=False, default=300)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    script = relationship("Script", back_populates="versions")
    deployments = relationship("Deployment", back_populates="script_version")
