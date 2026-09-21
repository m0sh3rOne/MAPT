from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel
from app.schemas.device import DeviceResponse


class JobLogResponse(BaseModel):
    id: UUID
    timestamp: datetime
    level: str
    message: str

    class Config:
        from_attributes = True


class TargetLogCreate(BaseModel):
    level: str = "INFO"
    message: str
    timestamp: Optional[datetime] = None


class BatchLogsCreate(BaseModel):
    logs: List[TargetLogCreate]


class DeploymentTargetResponse(BaseModel):
    id: UUID
    deployment_id: UUID
    device_id: UUID
    device_hostname: Optional[str] = None
    device_ip: Optional[str] = None
    status: str
    retry_count: int
    max_retries: int
    created_at: datetime
    offered_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class DeploymentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    deployment_type: str  # package, script, command
    package_version_id: Optional[UUID] = None
    script_version_id: Optional[UUID] = None
    custom_command: Optional[str] = None
    target_all_devices: bool = False
    target_device_ids: List[UUID] = []
    target_group_ids: List[UUID] = []
    
    # Scheduling & Recurrence fields
    is_recurring: bool = False
    schedule_type: str = "immediate"  # immediate, once, hourly, daily, weekly, monthly, yearly, cron
    scheduled_at: Optional[datetime] = None  # Date/time start
    scheduled_time: Optional[str] = None  # ex: "08:30"
    scheduled_days_of_week: Optional[str] = None  # ex: "1,3,5"
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None  # hours, days, weeks, months, years
    cron_expression: Optional[str] = None
    end_at: Optional[datetime] = None
    
    # Wake-on-LAN
    wake_on_lan: bool = False


class DeploymentResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    deployment_type: str
    status: str
    package_version_id: Optional[UUID] = None
    script_version_id: Optional[UUID] = None
    custom_command: Optional[str] = None
    created_by: Optional[UUID] = None
    
    # Wake-on-LAN
    wake_on_lan: bool = False
    
    # Scheduling & Recurrence fields
    is_recurring: bool = False
    schedule_type: str = "immediate"
    scheduled_at: Optional[datetime] = None
    scheduled_time: Optional[str] = None
    scheduled_days_of_week: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    cron_expression: Optional[str] = None
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    target_all_devices: bool = False
    target_device_ids: Optional[List[str]] = None
    target_group_ids: Optional[List[str]] = None

    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_targets: int = 0
    succeeded_targets: int = 0
    failed_targets: int = 0
    running_targets: int = 0
    pending_targets: int = 0

    class Config:
        from_attributes = True


class BulkDeleteDeploymentsRequest(BaseModel):
    deployment_ids: List[UUID]


class ActionCountResponse(BaseModel):
    success: bool
    count: int
    message: str
