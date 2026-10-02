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
    is_approved: bool = True
    enabled: bool
    is_online: bool = False
    mac_address: Optional[str] = None
    mac_addresses: Optional[List[str]] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    group_ids: List[UUID] = []

    class Config:
        from_attributes = True


class DeviceBatchApproveRequest(BaseModel):
    device_ids: List[UUID]


class WolDeviceRequest(BaseModel):
    broadcast_ip: Optional[str] = None
    port: Optional[int] = 9


class WolBatchRequest(BaseModel):
    device_ids: List[UUID]
    broadcast_ip: Optional[str] = None
    port: Optional[int] = 9


class DeviceBatchDeleteRequest(BaseModel):
    device_ids: List[UUID]
    uninstall_agent: bool = True


class WolCustomRequest(BaseModel):
    mac_address: str
    broadcast_ip: Optional[str] = None
    port: Optional[int] = 9


class WolResultResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Any] = None


class DeviceInventoryUpdate(BaseModel):
    os_caption: Optional[str] = None
    os_display_version: Optional[str] = None
    os_build: Optional[str] = None
    os_architecture: Optional[str] = None
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


class GroupOperatorResponse(BaseModel):
    id: UUID
    username: str
    email: Optional[str] = None
    role: str

    class Config:
        from_attributes = True


class DeviceGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    operator_ids: Optional[List[UUID]] = None


class DeviceGroupResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    device_count: int = 0
    device_ids: List[UUID] = []
    operator_ids: List[UUID] = []
    operators: List[GroupOperatorResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True



class AddDeviceToGroupRequest(BaseModel):
    device_ids: List[UUID]


class DeviceTargetHistoryResponse(BaseModel):
    id: UUID
    deployment_id: Optional[UUID] = None
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


