from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.package import Package, PackageVersion
from app.models.audit import AuditAction
from app.repositories.package_repository import PackageRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.package import PackageCreate, PackageUpdate, PackageResponse, PackageVersionResponse, PackageVersionUpdate
from app.storage.minio import upload_file_bytes


class PackageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.package_repo = PackageRepository(db)
        self.audit_repo = AuditRepository(db)

    def _map_to_response(self, package: Package) -> PackageResponse:
        latest = None
        if package.versions:
            latest_v = package.versions[0]
            latest = PackageVersionResponse.model_validate(latest_v)

        return PackageResponse(
            id=package.id,
            name=package.name,
            description=package.description,
            package_type=package.package_type,
            created_by=package.created_by,
            created_at=package.created_at,
            archived=package.archived,
            latest_version=latest,
            version_count=len(package.versions) if package.versions else 0
        )

    async def get_all_packages(self) -> List[PackageResponse]:
        packages = await self.package_repo.get_all()
        return [self._map_to_response(p) for p in packages]

    async def get_package_by_id(self, package_id: UUID) -> PackageResponse:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")
        return self._map_to_response(package)

    async def create_package(self, package_in: PackageCreate, user_id: UUID, ip_address: Optional[str] = None) -> PackageResponse:
        existing = await self.package_repo.get_by_name(package_in.name)
        if existing:
            raise HTTPException(status_code=400, detail="Un package avec ce nom existe déjà.")

        package = Package(
            name=package_in.name,
            description=package_in.description,
            package_type=package_in.package_type,
            created_by=user_id
        )
        created = await self.package_repo.create(package)

        await self.audit_repo.create(
            action=AuditAction.PACKAGE_CREATED,
            entity_type="package",
            user_id=user_id,
            entity_id=created.id,
            details={"name": created.name, "type": created.package_type},
            ip_address=ip_address
        )
        return self._map_to_response(created)

    async def create_package_with_file(
        self,
        name: str,
        description: Optional[str],
        package_type: str,
        version_str: str,
        filename: str,
        file_bytes: bytes,
        run_with: Optional[str] = None,
        run_with_args: Optional[str] = None,
        package_args: Optional[str] = None,
        run_as_admin: bool = True,
        is_interactive: bool = False,
        destination_folder: Optional[str] = "%APPDATA%\\MAPT\\packages",
        install_command: Optional[str] = None,
        uninstall_command: Optional[str] = None,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None
    ) -> PackageResponse:
        existing = await self.package_repo.get_by_name(name)
        if existing:
            raise HTTPException(status_code=400, detail="Un package avec ce nom existe déjà.")

        try:
            package = Package(
                name=name,
                description=description,
                package_type=package_type,
                created_by=user_id
            )
            created = await self.package_repo.create(package)

            await self.audit_repo.create(
                action=AuditAction.PACKAGE_CREATED,
                entity_type="package",
                user_id=user_id,
                entity_id=created.id,
                details={"name": created.name, "type": created.package_type, "version": version_str, "filename": filename},
                ip_address=ip_address
            )

            await self.upload_package_version(
                package_id=created.id,
                version_str=version_str,
                filename=filename,
                file_bytes=file_bytes,
                run_with=run_with,
                run_with_args=run_with_args,
                package_args=package_args,
                run_as_admin=run_as_admin,
                is_interactive=is_interactive,
                destination_folder=destination_folder,
                install_command=install_command,
                uninstall_command=uninstall_command,
                user_id=user_id,
                ip_address=ip_address
            )

            refreshed = await self.package_repo.get_by_id(created.id)
            return self._map_to_response(refreshed)
        except Exception as e:
            await self.audit_repo.create(
                action=AuditAction.PACKAGE_UPLOAD_FAILED,
                entity_type="package",
                user_id=user_id,
                entity_id=None,
                details={"name": name, "filename": filename, "error": str(e)},
                ip_address=ip_address
            )
            raise

    async def upload_package_version(
        self,
        package_id: UUID,
        version_str: str,
        filename: str,
        file_bytes: bytes,
        run_with: Optional[str] = None,
        run_with_args: Optional[str] = None,
        package_args: Optional[str] = None,
        run_as_admin: bool = True,
        is_interactive: bool = False,
        destination_folder: Optional[str] = "%APPDATA%\\MAPT\\packages",
        install_command: Optional[str] = None,
        uninstall_command: Optional[str] = None,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None
    ) -> PackageVersionResponse:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")

        try:
            # Upload vers MinIO/Disque local et calcul SHA-256
            storage_key, sha256_hash, size_bytes = upload_file_bytes(file_bytes, filename)

            # Si run_with / arguments ne sont pas spécifiés, générer par défaut selon l'extension FOG-style
            ext = filename.lower()
            if not run_with and not install_command:
                if ext.endswith(".msi"):
                    run_with = "c:\\windows\\system32\\msiexec.exe"
                    if not run_with_args:
                        run_with_args = "/i"
                    if not package_args and not is_interactive:
                        package_args = "/qn /norestart"
                elif ext.endswith(".vbs"):
                    run_with = "c:\\windows\\system32\\cscript.exe"
                    if not run_with_args:
                        run_with_args = "//nologo"
                elif ext.endswith(".exe"):
                    pass

            version = PackageVersion(
                package_id=package.id,
                version=version_str,
                filename=filename,
                storage_key=storage_key,
                sha256=sha256_hash,
                size_bytes=size_bytes,
                run_with=run_with,
                run_with_args=run_with_args,
                package_args=package_args,
                run_as_admin=run_as_admin,
                is_interactive=is_interactive,
                destination_folder=destination_folder or "%APPDATA%\\MAPT\\packages",
                install_command=install_command,
                uninstall_command=uninstall_command
            )
            created_version = await self.package_repo.add_version(version)

            await self.audit_repo.create(
                action=AuditAction.PACKAGE_VERSION_UPLOADED,
                entity_type="package_version",
                user_id=user_id,
                entity_id=created_version.id,
                details={
                    "package_name": package.name,
                    "version": version_str,
                    "filename": filename,
                    "sha256": sha256_hash,
                    "size_bytes": size_bytes,
                    "run_with": run_with,
                    "run_as_admin": run_as_admin
                },
                ip_address=ip_address
            )
            return PackageVersionResponse.model_validate(created_version)
        except Exception as e:
            await self.audit_repo.create(
                action=AuditAction.PACKAGE_UPLOAD_FAILED,
                entity_type="package_version",
                user_id=user_id,
                entity_id=package.id,
                details={"package_name": package.name, "filename": filename, "version": version_str, "error": str(e)},
                ip_address=ip_address
            )
            raise

    async def delete_package(self, package_id: UUID, user_id: Optional[UUID] = None, ip_address: Optional[str] = None) -> bool:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")

        deleted = await self.package_repo.delete(package_id)
        if deleted:
            await self.audit_repo.create(
                action=AuditAction.PACKAGE_ARCHIVED,
                entity_type="package",
                user_id=user_id,
                entity_id=package_id,
                details={"name": package.name},
                ip_address=ip_address
            )
        return deleted

    async def update_package(
        self,
        package_id: UUID,
        package_in: PackageUpdate,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None
    ) -> PackageResponse:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")

        values = package_in.model_dump(exclude_unset=True)
        if not values:
            return self._map_to_response(package)

        if "name" in values and values["name"] != package.name:
            existing = await self.package_repo.get_by_name(values["name"])
            if existing and existing.id != package_id:
                raise HTTPException(status_code=400, detail="Un package avec ce nom existe déjà.")

        updated = await self.package_repo.update_package(package_id, values)
        
        await self.audit_repo.create(
            action=AuditAction.PACKAGE_UPDATED,
            entity_type="package",
            user_id=user_id,
            entity_id=package_id,
            details=values,
            ip_address=ip_address
        )
        return self._map_to_response(updated)

    async def update_package_version(
        self,
        package_id: UUID,
        version_id: UUID,
        version_in: PackageVersionUpdate,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None
    ) -> PackageVersionResponse:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")

        version = await self.package_repo.get_version_by_id(version_id)
        if not version or version.package_id != package_id:
            raise HTTPException(status_code=404, detail="Version du package introuvable.")

        values = version_in.model_dump(exclude_unset=True)
        if not values:
            return PackageVersionResponse.model_validate(version)

        updated_version = await self.package_repo.update_version(version_id, values)

        await self.audit_repo.create(
            action=AuditAction.PACKAGE_VERSION_UPDATED,
            entity_type="package_version",
            user_id=user_id,
            entity_id=version_id,
            details=values,
            ip_address=ip_address
        )
        return PackageVersionResponse.model_validate(updated_version)

    async def get_versions(self, package_id: UUID) -> List[PackageVersionResponse]:
        versions = await self.package_repo.get_versions_by_package_id(package_id)
        return [PackageVersionResponse.model_validate(v) for v in versions]
