import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_target_id = Column(UUID(as_uuid=True), ForeignKey("deployment_targets.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    level = Column(String(20), default="INFO", nullable=False)  # DEBUG, INFO, WARNING, ERROR
    message = Column(Text, nullable=False)

    target = relationship("DeploymentTarget", back_populates="logs")
