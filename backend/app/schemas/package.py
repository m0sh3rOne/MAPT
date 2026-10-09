from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class PackageVersionResponse(BaseModel):
    id: UUID
    package_id: UUID
    version: str
    filename: str
    storage_key: str
    sha256: str
    size_bytes: int
    run_with: Optional[str] = None
    run_with_args: Optional[str] = None
    package_args: Optional[str] = None
    run_as_admin: bool = True
    is_interactive: bool = False
    destination_folder: Optional[str] = "%APPDATA%\\MAPT\\packages"
    install_command: Optional[str] = None
    uninstall_command: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PackageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    package_type: str = "msi"  # msi, exe, zip, vbs, ps1, bat


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    package_type: Optional[str] = None


class PackageVersionUpdate(BaseModel):
    run_with: Optional[str] = None
    run_with_args: Optional[str] = None
    package_args: Optional[str] = None
    run_as_admin: Optional[bool] = None
    is_interactive: Optional[bool] = None
    destination_folder: Optional[str] = None
    install_command: Optional[str] = None
    uninstall_command: Optional[str] = None


class PackageResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    package_type: str
    created_by: Optional[UUID] = None
    created_at: datetime
    archived: bool
    latest_version: Optional[PackageVersionResponse] = None
    version_count: int = 0

    class Config:
        from_attributes = True


class ScriptVersionCreate(BaseModel):
    content: str
    timeout_seconds: int = 300


class ScriptVersionResponse(BaseModel):
    id: UUID
    script_id: UUID
    version: int
    content: str
    sha256: str
    timeout_seconds: int
    created_by: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScriptCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: str = "powershell"  # powershell, python, cmd
    initial_content: Optional[str] = ""
    content: Optional[str] = None
    script_type: Optional[str] = None
    category: Optional[str] = None
    timeout_seconds: int = 300


class ScriptResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    language: str
    created_by: Optional[UUID] = None
    created_at: datetime
    archived: bool
    latest_version: Optional[ScriptVersionResponse] = None
    version_count: int = 0

    class Config:
        from_attributes = True
