import io
import json
import re
import zipfile
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import logger
from app.models.package import Package, PackageVersion
from app.models.audit import AuditAction
from app.repositories.package_repository import PackageRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.package import PackageCreate, PackageUpdate, PackageResponse, PackageVersionResponse, PackageVersionUpdate
from app.storage.minio import upload_file_bytes, get_file_bytes


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

    async def export_package_zip(self, package_id: UUID, version_id: Optional[UUID] = None) -> Tuple[bytes, str]:
        package = await self.package_repo.get_by_id(package_id)
        if not package:
            raise HTTPException(status_code=404, detail="Package introuvable.")

        target_version = None
        if version_id:
            for v in package.versions:
                if v.id == version_id:
                    target_version = v
                    break
        elif package.versions:
            target_version = package.versions[0]

        if not target_version:
            raise HTTPException(status_code=400, detail="Ce package ne possède aucun fichier binaire ou version associée à exporter.")

        # 1. Récupérer les octets du fichier exécutable
        file_bytes = get_file_bytes(target_version.storage_key)

        # 2. Construire les métadonnées snapin.json
        snapin_data = {
            "$schema": "https://mapt.local/schemas/snapin-export-v1.json",
            "export_version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "snapin": {
                "name": package.name,
                "description": package.description or "",
                "package_type": package.package_type,
                "version": target_version.version,
                "filename": target_version.filename,
                "sha256": target_version.sha256,
                "size_bytes": target_version.size_bytes,
                "run_with": target_version.run_with or "",
                "run_with_args": target_version.run_with_args or "",
                "package_args": target_version.package_args or "",
                "run_as_admin": target_version.run_as_admin,
                "is_interactive": target_version.is_interactive,
                "destination_folder": target_version.destination_folder or "%ProgramData%\\MAPT\\packages",
                "install_command": target_version.install_command or "",
                "uninstall_command": target_version.uninstall_command or ""
            }
        }
        json_bytes = json.dumps(snapin_data, indent=2, ensure_ascii=False).encode("utf-8")

        # 3. Créer l'archive ZIP en mémoire
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr("snapin.json", json_bytes)
            zip_file.writestr(target_version.filename, file_bytes)

        zip_bytes = zip_buffer.getvalue()

        # 4. Nom de fichier d'export propre
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', package.name.strip().lower())
        clean_version = re.sub(r'[^a-zA-Z0-9_\-]', '_', target_version.version.strip().lower())
        zip_filename = f"mapt_snapin_{clean_name}_{clean_version}.zip"

        return zip_bytes, zip_filename

    async def inspect_package_zip(self, zip_bytes: bytes) -> dict:
        try:
            zip_buffer = io.BytesIO(zip_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as z:
                namelist = z.namelist()
                if not namelist:
                    raise HTTPException(status_code=400, detail="L'archive ZIP fournie est vide.")

                # Chercher le fichier JSON de métadonnées (snapin.json, package.json ou *.json)
                json_filename = None
                for fname in ["snapin.json", "package.json", "mapt_package.json"]:
                    if fname in namelist:
                        json_filename = fname
                        break
                if not json_filename:
                    for fname in namelist:
                        if fname.lower().endswith(".json") and not fname.startswith("__MACOSX"):
                            json_filename = fname
                            break

                meta = {}
                if json_filename:
                    try:
                        raw_json = z.read(json_filename).decode("utf-8")
                        parsed = json.loads(raw_json)
                        meta = parsed.get("snapin") or parsed.get("package") or parsed
                    except Exception as e:
                        logger.warning(f"Impossible de parser le JSON {json_filename}: {e}")

                # Chercher le fichier binaire payload
                payload_filename = meta.get("filename")
                if not payload_filename or payload_filename not in namelist:
                    candidates = [
                        f for f in namelist 
                        if not f.endswith("/") and not f.lower().endswith(".json") and not f.startswith("__MACOSX")
                    ]
                    if candidates:
                        payload_filename = candidates[0]

                payload_size = 0
                if payload_filename and payload_filename in namelist:
                    payload_size = z.getinfo(payload_filename).file_size

                ext = (payload_filename or "").split(".")[-1].lower() if payload_filename else "msi"
                detected_type = meta.get("package_type") or (ext if ext in ["msi", "exe", "vbs", "ps1", "bat", "zip"] else "exe")

                suggested_name = meta.get("name")
                if not suggested_name and payload_filename:
                    suggested_name = payload_filename.rsplit(".", 1)[0]

                return {
                    "valid": bool(payload_filename),
                    "json_found": bool(json_filename),
                    "name": suggested_name or "Package importé",
                    "description": meta.get("description", ""),
                    "package_type": detected_type,
                    "version": meta.get("version", "1.0.0"),
                    "filename": payload_filename or "inconnu",
                    "size_bytes": payload_size,
                    "run_with": meta.get("run_with", ""),
                    "run_with_args": meta.get("run_with_args", ""),
                    "package_args": meta.get("package_args", ""),
                    "run_as_admin": meta.get("run_as_admin", True),
                    "is_interactive": meta.get("is_interactive", False),
                    "destination_folder": meta.get("destination_folder", "%ProgramData%\\MAPT\\packages"),
                    "install_command": meta.get("install_command", ""),
                    "uninstall_command": meta.get("uninstall_command", ""),
                    "files_in_zip": [f for f in namelist if not f.startswith("__MACOSX")]
                }
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Le fichier fourni n'est pas une archive ZIP valide.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erreur lors de l'analyse du ZIP : {str(e)}")

    async def import_package_zip(
        self,
        zip_bytes: bytes,
        override_name: Optional[str] = None,
        override_description: Optional[str] = None,
        override_version: Optional[str] = None,
        override_package_args: Optional[str] = None,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None
    ) -> PackageResponse:
        info = await self.inspect_package_zip(zip_bytes)
        if not info["valid"] or not info["filename"]:
            raise HTTPException(status_code=400, detail="L'archive ZIP ne contient aucun fichier exécutable installable.")

        zip_buffer = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as z:
            file_bytes = z.read(info["filename"])

        pkg_name = (override_name or info["name"]).strip()
        pkg_desc = override_description if override_description is not None else info["description"]
        pkg_type = info["package_type"]
        pkg_version = (override_version or info["version"] or "1.0.0").strip()
        pkg_args = override_package_args if override_package_args is not None else info["package_args"]

        existing = await self.package_repo.get_by_name(pkg_name)
        if existing:
            await self.upload_package_version(
                package_id=existing.id,
                version_str=pkg_version,
                filename=info["filename"],
                file_bytes=file_bytes,
                run_with=info["run_with"],
                run_with_args=info["run_with_args"],
                package_args=pkg_args,
                run_as_admin=info["run_as_admin"],
                is_interactive=info["is_interactive"],
                destination_folder=info["destination_folder"],
                install_command=info["install_command"],
                uninstall_command=info["uninstall_command"],
                user_id=user_id,
                ip_address=ip_address
            )
            if pkg_desc and pkg_desc != existing.description:
                await self.package_repo.update_package(existing.id, {"description": pkg_desc})
            refreshed = await self.package_repo.get_by_id(existing.id)
            return self._map_to_response(refreshed)
        else:
            return await self.create_package_with_file(
                name=pkg_name,
                description=pkg_desc,
                package_type=pkg_type,
                version_str=pkg_version,
                filename=info["filename"],
                file_bytes=file_bytes,
                run_with=info["run_with"],
                run_with_args=info["run_with_args"],
                package_args=pkg_args,
                run_as_admin=info["run_as_admin"],
                is_interactive=info["is_interactive"],
                destination_folder=info["destination_folder"],
                install_command=info["install_command"],
                uninstall_command=info["uninstall_command"],
                user_id=user_id,
                ip_address=ip_address
            )
