import hashlib
from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.script import Script, ScriptVersion
from app.models.audit import AuditAction
from app.repositories.script_repository import ScriptRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.package import ScriptCreate, ScriptResponse, ScriptVersionResponse, ScriptVersionCreate


class ScriptService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.script_repo = ScriptRepository(db)
        self.audit_repo = AuditRepository(db)

    def _map_to_response(self, script: Script) -> ScriptResponse:
        latest = None
        if script.versions:
            latest_v = script.versions[0]
            latest = ScriptVersionResponse.model_validate(latest_v)

        return ScriptResponse(
            id=script.id,
            name=script.name,
            description=script.description,
            language=script.language,
            created_by=script.created_by,
            created_at=script.created_at,
            archived=script.archived,
            latest_version=latest,
            version_count=len(script.versions) if script.versions else 0
        )

    async def get_all_scripts(self) -> List[ScriptResponse]:
        scripts = await self.script_repo.get_all()
        return [self._map_to_response(s) for s in scripts]

    async def get_script_by_id(self, script_id: UUID) -> ScriptResponse:
        script = await self.script_repo.get_by_id(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script introuvable.")
        return self._map_to_response(script)

    async def create_script(self, script_in: ScriptCreate, user_id: UUID, ip_address: Optional[str] = None) -> ScriptResponse:
        existing = await self.script_repo.get_by_name(script_in.name)
        if existing:
            raise HTTPException(status_code=400, detail="Un script avec ce nom existe déjà.")

        script = Script(
            name=script_in.name,
            description=script_in.description,
            language=script_in.language,
            created_by=user_id
        )
        created = await self.script_repo.create(script)

        # Création de la version initiale 1 si du contenu est fourni
        content = script_in.initial_content or "# Nouveau script\n"
        sha256_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        v1 = ScriptVersion(
            script_id=created.id,
            version=1,
            content=content,
            sha256=sha256_hash,
            timeout_seconds=script_in.timeout_seconds,
            created_by=user_id
        )
        await self.script_repo.add_version(v1)

        await self.audit_repo.create(
            action=AuditAction.SCRIPT_CREATED,
            entity_type="script",
            user_id=user_id,
            entity_id=created.id,
            details={"name": created.name, "language": created.language},
            ip_address=ip_address
        )

        return await self.get_script_by_id(created.id)

    async def add_script_version(
        self,
        script_id: UUID,
        version_in: ScriptVersionCreate,
        user_id: UUID,
        ip_address: Optional[str] = None
    ) -> ScriptVersionResponse:
        script = await self.script_repo.get_by_id(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script introuvable.")

        latest_num = await self.script_repo.get_latest_version_number(script_id)
        new_version_num = latest_num + 1

        sha256_hash = hashlib.sha256(version_in.content.encode("utf-8")).hexdigest()
        new_version = ScriptVersion(
            script_id=script.id,
            version=new_version_num,
            content=version_in.content,
            sha256=sha256_hash,
            timeout_seconds=version_in.timeout_seconds,
            created_by=user_id
        )
        created = await self.script_repo.add_version(new_version)

        await self.audit_repo.create(
            action=AuditAction.SCRIPT_VERSION_CREATED,
            entity_type="script_version",
            user_id=user_id,
            entity_id=created.id,
            details={"script_name": script.name, "version": new_version_num, "sha256": sha256_hash},
            ip_address=ip_address
        )
        return ScriptVersionResponse.model_validate(created)

    async def get_versions(self, script_id: UUID) -> List[ScriptVersionResponse]:
        versions = await self.script_repo.get_versions_by_script_id(script_id)
        return [ScriptVersionResponse.model_validate(v) for v in versions]

    async def delete_script(self, script_id: UUID, user_id: UUID, ip_address: Optional[str] = None) -> bool:
        script = await self.script_repo.get_by_id(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script introuvable.")

        script_name = script.name
        deleted = await self.script_repo.delete(script_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Script introuvable.")

        await self.audit_repo.create(
            action=AuditAction.SCRIPT_ARCHIVED,
            entity_type="script",
            user_id=user_id,
            entity_id=script_id,
            details={"name": script_name},
            ip_address=ip_address
        )
        return True
