from typing import Optional, List, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.audit import AuditLog


class AuditRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        action: str,
        entity_type: str,
        user_id: Optional[UUID] = None,
        entity_id: Optional[UUID] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None
    ) -> AuditLog:
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=ip_address
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def get_all(self, skip: int = 0, limit: int = 200) -> List[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .options(selectinload(AuditLog.user))
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_id(self, log_id: UUID) -> Optional[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .options(selectinload(AuditLog.user))
            .where(AuditLog.id == log_id)
        )
        return result.scalar_one_or_none()

    async def delete_by_id(self, log_id: UUID) -> bool:
        log = await self.get_by_id(log_id)
        if log:
            await self.db.delete(log)
            await self.db.flush()
            return True
        return False

    async def delete_bulk(self, log_ids: List[UUID]) -> int:
        result = await self.db.execute(
            select(AuditLog).where(AuditLog.id.in_(log_ids))
        )
        logs = list(result.scalars().all())
        count = len(logs)
        for log in logs:
            await self.db.delete(log)
        await self.db.flush()
        return count

    async def clear_all(self) -> int:
        result = await self.db.execute(select(AuditLog))
        logs = list(result.scalars().all())
        count = len(logs)
        for log in logs:
            await self.db.delete(log)
        await self.db.flush()
        return count
