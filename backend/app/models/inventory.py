from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class DeviceInventory(Base):
    __tablename__ = "device_inventory"

    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    cpu_model = Column(String(255), nullable=True)
    cpu_cores = Column(Integer, nullable=True)
    total_memory_mb = Column(Integer, nullable=True)
    disk_total_gb = Column(Float, nullable=True)
    disk_free_gb = Column(Float, nullable=True)
    mac_addresses = Column(JSON, nullable=True)
    network_interfaces = Column(JSON, nullable=True)
    current_user = Column(String(255), nullable=True)
    last_boot_at = Column(DateTime(timezone=True), nullable=True)
    installed_software = Column(JSON, nullable=True)
    local_users = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    device = relationship("Device", back_populates="inventory")
