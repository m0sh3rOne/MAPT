from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class McpToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool = False
    default: Optional[Any] = None


class McpToolInfo(BaseModel):
    name: str
    description: str
    category: str
    parameters: List[McpToolParameter] = []


class McpStatusResponse(BaseModel):
    enabled: bool
    server_url: str
    api_url: str
    host: str
    port: int
    is_running: bool
    tools_count: int
    tools: List[McpToolInfo]
    config_claude_desktop: Dict[str, Any]
    config_antigravity: Dict[str, Any]
    config_cursor: Dict[str, Any]
    config_python_cli: str


class McpToggleRequest(BaseModel):
    enabled: bool


class McpSettingsUpdateRequest(BaseModel):
    port: Optional[int] = Field(default=8080, ge=1024, le=65535)
    custom_host: Optional[str] = None
    allowed_ips: Optional[str] = None


class McpTestConnectionRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    api_url: Optional[str] = None


class McpTestConnectionResponse(BaseModel):
    success: bool
    message: str
    token_valid: bool
    devices_detected: int = 0
    latency_ms: float = 0.0
