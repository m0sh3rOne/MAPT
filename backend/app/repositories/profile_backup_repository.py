from typing import Optional, List, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc, or_
from app.models.profile_backup import UserProfileBackup, ProfileBackupStatus


class ProfileBackupRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, backup_id: UUID) -> Optional[UserProfileBackup]:
        result = await self.db.execute(
            select(UserProfileBackup).where(UserProfileBackup.id == backup_id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        status: Optional[str] = None,
        source_device_id: Optional[UUID] = None,
    ) -> Tuple[List[UserProfileBackup], int]:
        query = select(UserProfileBackup)
        
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                or_(
                    UserProfileBackup.profile_name.ilike(search_pattern),
                    UserProfileBackup.source_hostname.ilike(search_pattern),
                    UserProfileBackup.user_sid.ilike(search_pattern),
                    UserProfileBackup.notes.ilike(search_pattern),
                )
            )

        if status:
            query = query.where(UserProfileBackup.status == status)

        if source_device_id:
            query = query.where(UserProfileBackup.source_device_id == source_device_id)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar_one()

        # Order and pagination
        query = query.order_by(desc(UserProfileBackup.created_at)).offset(skip).limit(limit)
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def create(self, backup: UserProfileBackup) -> UserProfileBackup:
        self.db.add(backup)
        await self.db.commit()
        await self.db.refresh(backup)
        return backup

    async def update_status(
        self,
        backup_id: UUID,
        status: str,
        size_bytes: Optional[int] = None,
        sha256: Optional[str] = None,
        user_sid: Optional[str] = None,
        error_message: Optional[str] = None,
        metadata_info: Optional[dict] = None,
    ) -> Optional[UserProfileBackup]:
        values = {"status": status}
        if size_bytes is not None:
            values["size_bytes"] = size_bytes
        if sha256 is not None:
            values["sha256"] = sha256
        if user_sid is not None:
            values["user_sid"] = user_sid
        if error_message is not None:
            values["error_message"] = error_message
        if metadata_info is not None:
            values["metadata_info"] = metadata_info

        await self.db.execute(
            update(UserProfileBackup)
            .where(UserProfileBackup.id == backup_id)
            .values(**values)
        )
        await self.db.commit()
        return await self.get_by_id(backup_id)

    async def delete(self, backup_id: UUID) -> bool:
        result = await self.db.execute(
            delete(UserProfileBackup).where(UserProfileBackup.id == backup_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_summary(self) -> dict:
        result = await self.db.execute(
            select(
                func.count(UserProfileBackup.id),
                func.coalesce(func.sum(UserProfileBackup.size_bytes), 0),
                func.count().filter(UserProfileBackup.status == ProfileBackupStatus.READY),
                func.count().filter(UserProfileBackup.status.in_([ProfileBackupStatus.PENDING, ProfileBackupStatus.BACKING_UP, ProfileBackupStatus.RESTORING])),
                func.count().filter(UserProfileBackup.status == ProfileBackupStatus.FAILED),
            )
        )
        row = result.one()
        return {
            "total_profiles": row[0],
            "total_size_bytes": row[1],
            "ready_count": row[2],
            "in_progress_count": row[3],
            "failed_count": row[4],
        }
