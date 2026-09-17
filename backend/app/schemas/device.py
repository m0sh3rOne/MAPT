from datetime import datetime, timezone
from typing import Optional, List, Any
from uuid import UUID
from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    hostname: str
    os_name: str = "Windows"
    os_version: Optional[str] = None
    os_build: Optional[str] = None
    agent_version: Optional[str] = None
    ip_address: Optional[str] = None


class DeviceCreate(DeviceBase):
    device_uuid: UUID


class DeviceResponse(DeviceBase):
    id: UUID
    device_uuid: UUID
    enabled: bool
    is_online: bool = False
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    group_ids: List[UUID] = []

    class Config:
        from_attributes = True


class DeviceInventoryUpdate(BaseModel):
    cpu_model: Optional[str] = None
    cpu_cores: Optional[int] = None
    total_memory_mb: Optional[int] = None
    disk_total_gb: Optional[float] = None
    disk_free_gb: Optional[float] = None
    mac_addresses: Optional[List[str]] = None
    network_interfaces: Optional[List[dict]] = None
    current_user: Optional[str] = None
    last_boot_at: Optional[datetime] = None
    installed_software: Optional[List[dict]] = None
    local_users: Optional[List[dict]] = None


class DeviceInventoryResponse(DeviceInventoryUpdate):
    device_id: UUID
    updated_at: datetime

    class Config:
        from_attributes = True


class DeviceGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DeviceGroupResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    device_count: int = 0
    device_ids: List[UUID] = []
    created_at: datetime

    class Config:
        from_attributes = True


class AddDeviceToGroupRequest(BaseModel):
    device_ids: List[UUID]


class DeviceTargetHistoryResponse(BaseModel):
    id: UUID
    deployment_id: UUID
    deployment_name: str
    deployment_type: str
    custom_command: Optional[str] = None
    status: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class ActionCountResponse(BaseModel):
    success: bool = True
    count: int
    message: str


