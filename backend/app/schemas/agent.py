from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from pydantic import BaseModel


class AgentEnrollRequest(BaseModel):
    device_uuid: UUID
    hostname: str
    wins_name: Optional[str] = None
    os_name: str = "Windows"
    os_version: Optional[str] = None
    os_build: Optional[str] = None
    agent_version: str = "1.0.0"
    ip_address: Optional[str] = None
    enrollment_token: str


class AgentEnrollResponse(BaseModel):
    device_id: UUID
    device_uuid: UUID
    agent_token: str
    server_time: datetime
    poll_interval_seconds: int = 30
    heartbeat_interval_seconds: int = 30
    inventory_interval_seconds: int = 3600


class AgentHeartbeatRequest(BaseModel):
    device_uuid: UUID
    hostname: Optional[str] = None
    wins_name: Optional[str] = None
    agent_version: str = "1.0.0"
    ip_address: Optional[str] = None
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    os_build: Optional[str] = None
    timestamp: datetime


class AgentHeartbeatResponse(BaseModel):
    acknowledged: bool = True
    server_time: datetime
    poll_interval_seconds: int = 30
    inventory_interval_seconds: int = 3600


class AgentJobPayload(BaseModel):
    job_id: UUID
    type: str  # package, powershell, python, command
    timeout_seconds: int = 300
    payload: Dict[str, Any]  # download_url, sha256, filename, install_command, script_content, arguments, executable


class AgentJobAckRequest(BaseModel):
    acknowledged: bool = True


class AgentJobProgressRequest(BaseModel):
    status: str = "RUNNING"
    progress: int = 0
    message: Optional[str] = None


class AgentJobCompleteRequest(BaseModel):
    status: str = "SUCCEEDED"
    exit_code: int = 0
    duration_seconds: Optional[float] = None
    output: Optional[str] = None


class AgentJobFailRequest(BaseModel):
    status: str = "FAILED"
    exit_code: int = 1
    error: str
    output: Optional[str] = None


class TargetLogCreate(BaseModel):
    level: str = "INFO"
    message: str
    timestamp: Optional[datetime] = None


class BatchLogsCreate(BaseModel):
    logs: List[TargetLogCreate]
