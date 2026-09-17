from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.script import Script, ScriptVersion


class ScriptRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, script_id: UUID) -> Optional[Script]:
        result = await self.db.execute(
            select(Script)
            .options(selectinload(Script.versions))
            .where(Script.id == script_id, Script.archived == False)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[Script]:
        result = await self.db.execute(
            select(Script)
            .options(selectinload(Script.versions))
            .where(Script.name == name, Script.archived == False)
        )
        return result.scalar_one_or_none()

    async def get_all(self, include_archived: bool = False) -> List[Script]:
        query = select(Script).options(selectinload(Script.versions)).order_by(Script.name)
        if not include_archived:
            query = query.where(Script.archived == False)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, script: Script) -> Script:
        self.db.add(script)
        await self.db.flush()
        await self.db.refresh(script)
        return script

    async def add_version(self, version: ScriptVersion) -> ScriptVersion:
        self.db.add(version)
        await self.db.flush()
        await self.db.refresh(version)
        return version

    async def get_version_by_id(self, version_id: UUID) -> Optional[ScriptVersion]:
        result = await self.db.execute(
            select(ScriptVersion)
            .options(selectinload(ScriptVersion.script))
            .where(ScriptVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def get_versions_by_script_id(self, script_id: UUID) -> List[ScriptVersion]:
        result = await self.db.execute(
            select(ScriptVersion)
            .where(ScriptVersion.script_id == script_id)
            .order_by(ScriptVersion.version.desc())
        )
        return list(result.scalars().all())

    async def get_latest_version_number(self, script_id: UUID) -> int:
        result = await self.db.execute(
            select(ScriptVersion.version)
            .where(ScriptVersion.script_id == script_id)
            .order_by(ScriptVersion.version.desc())
            .limit(1)
        )
        val = result.scalar_one_or_none()
        return val if val is not None else 0

    async def delete(self, script_id: UUID) -> bool:
        script = await self.get_by_id(script_id)
        if not script:
            return False
        script.archived = True
        await self.db.flush()
        return True
