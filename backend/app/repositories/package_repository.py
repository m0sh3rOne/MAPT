from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from app.models.package import Package, PackageVersion


class PackageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, package_id: UUID) -> Optional[Package]:
        result = await self.db.execute(
            select(Package)
            .options(selectinload(Package.versions))
            .where(Package.id == package_id, Package.archived == False)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[Package]:
        result = await self.db.execute(
            select(Package)
            .options(selectinload(Package.versions))
            .where(Package.name == name, Package.archived == False)
        )
        return result.scalar_one_or_none()

    async def get_all(self, include_archived: bool = False) -> List[Package]:
        query = select(Package).options(selectinload(Package.versions)).order_by(Package.name)
        if not include_archived:
            query = query.where(Package.archived == False)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, package: Package) -> Package:
        self.db.add(package)
        await self.db.commit()
        return await self.get_by_id(package.id)

    async def delete(self, package_id: UUID) -> bool:
        result = await self.db.execute(
            update(Package)
            .where(Package.id == package_id)
            .values(archived=True)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def add_version(self, version: PackageVersion) -> PackageVersion:
        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)
        return version

    async def get_version_by_id(self, version_id: UUID) -> Optional[PackageVersion]:
        result = await self.db.execute(
            select(PackageVersion)
            .options(selectinload(PackageVersion.package))
            .where(PackageVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def get_versions_by_package_id(self, package_id: UUID) -> List[PackageVersion]:
        result = await self.db.execute(
            select(PackageVersion)
            .where(PackageVersion.package_id == package_id)
            .order_by(PackageVersion.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_package(self, package_id: UUID, values: dict) -> Optional[Package]:
        if values:
            await self.db.execute(
                update(Package)
                .where(Package.id == package_id)
                .values(**values)
            )
            await self.db.commit()
        return await self.get_by_id(package_id)

    async def update_version(self, version_id: UUID, values: dict) -> Optional[PackageVersion]:
        if values:
            await self.db.execute(
                update(PackageVersion)
                .where(PackageVersion.id == version_id)
                .values(**values)
            )
            await self.db.commit()
        return await self.get_version_by_id(version_id)
