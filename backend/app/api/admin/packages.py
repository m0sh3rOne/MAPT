from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, UploadFile, File, Form, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.package import (
    PackageCreate,
    PackageUpdate,
    PackageResponse,
    PackageVersionResponse,
    PackageVersionUpdate
)
from app.services.package_service import PackageService
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/packages", tags=["Admin - Packages"])


@router.get("", response_model=List[PackageResponse])
async def list_packages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    return await service.get_all_packages()


@router.post("", response_model=PackageResponse)
async def create_package(
    package_in: PackageCreate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    client_ip = request.client.host if request.client else None
    return await service.create_package(package_in, current_user.id, client_ip)


@router.post("/upload", response_model=PackageResponse)
async def create_package_with_file(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    package_type: str = Form("msi"),
    version: str = Form("1.0.0"),
    file: UploadFile = File(...),
    run_with: Optional[str] = Form(None),
    run_with_args: Optional[str] = Form(None),
    package_args: Optional[str] = Form(None),
    run_as_admin: bool = Form(True),
    is_interactive: bool = Form(False),
    destination_folder: Optional[str] = Form("%APPDATA%\\MAPT\\packages"),
    install_command: Optional[str] = Form(None),
    uninstall_command: Optional[str] = Form(None),
    request: Request = None,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Fichier vide fourni.")

    client_ip = request.client.host if request and request.client else None
    return await service.create_package_with_file(
        name=name,
        description=description,
        package_type=package_type,
        version_str=version,
        filename=file.filename,
        file_bytes=file_bytes,
        run_with=run_with,
        run_with_args=run_with_args,
        package_args=package_args,
        run_as_admin=run_as_admin,
        is_interactive=is_interactive,
        destination_folder=destination_folder,
        install_command=install_command,
        uninstall_command=uninstall_command,
        user_id=current_user.id,
        ip_address=client_ip
    )


@router.get("/{package_id}", response_model=PackageResponse)
async def get_package(
    package_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    return await service.get_package_by_id(package_id)


@router.put("/{package_id}", response_model=PackageResponse)
async def update_package(
    package_id: UUID,
    package_in: PackageUpdate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    client_ip = request.client.host if request.client else None
    return await service.update_package(package_id, package_in, current_user.id, client_ip)


@router.delete("/{package_id}")
async def delete_package(
    package_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    client_ip = request.client.host if request.client else None
    deleted = await service.delete_package(package_id, current_user.id, client_ip)
    if not deleted:
        raise HTTPException(status_code=404, detail="Package introuvable.")
    return {"status": "success", "message": "Package supprimé avec succès."}


@router.put("/{package_id}/versions/{version_id}", response_model=PackageVersionResponse)
async def update_package_version(
    package_id: UUID,
    version_id: UUID,
    version_in: PackageVersionUpdate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    client_ip = request.client.host if request.client else None
    return await service.update_package_version(package_id, version_id, version_in, current_user.id, client_ip)


@router.get("/{package_id}/versions", response_model=List[PackageVersionResponse])
async def get_package_versions(
    package_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    return await service.get_versions(package_id)


@router.post("/{package_id}/versions", response_model=PackageVersionResponse)
async def upload_package_version(
    package_id: UUID,
    version: str = Form(...),
    file: UploadFile = File(...),
    run_with: Optional[str] = Form(None),
    run_with_args: Optional[str] = Form(None),
    package_args: Optional[str] = Form(None),
    run_as_admin: bool = Form(True),
    is_interactive: bool = Form(False),
    destination_folder: Optional[str] = Form("%APPDATA%\\MAPT\\packages"),
    install_command: Optional[str] = Form(None),
    uninstall_command: Optional[str] = Form(None),
    request: Request = None,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = PackageService(db)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Fichier vide fourni.")

    client_ip = request.client.host if request and request.client else None
    return await service.upload_package_version(
        package_id=package_id,
        version_str=version,
        filename=file.filename,
        file_bytes=file_bytes,
        run_with=run_with,
        run_with_args=run_with_args,
        package_args=package_args,
        run_as_admin=run_as_admin,
        is_interactive=is_interactive,
        destination_folder=destination_folder,
        install_command=install_command,
        uninstall_command=uninstall_command,
        user_id=current_user.id,
        ip_address=client_ip
    )
