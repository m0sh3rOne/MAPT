from typing import Optional, List, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from app.models.group import DeviceGroup, DeviceGroupMember, DeviceGroupOperator


class GroupRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, group_id: UUID) -> Optional[DeviceGroup]:
        result = await self.db.execute(
            select(DeviceGroup)
            .options(
                selectinload(DeviceGroup.members),
                selectinload(DeviceGroup.operators).selectinload(DeviceGroupOperator.user)
            )
            .where(DeviceGroup.id == group_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[DeviceGroup]:
        result = await self.db.execute(
            select(DeviceGroup)
            .options(
                selectinload(DeviceGroup.members),
                selectinload(DeviceGroup.operators).selectinload(DeviceGroupOperator.user)
            )
            .where(DeviceGroup.name == name)
        )
        return result.scalar_one_or_none()

    async def get_all(self) -> List[DeviceGroup]:
        result = await self.db.execute(
            select(DeviceGroup)
            .options(
                selectinload(DeviceGroup.members),
                selectinload(DeviceGroup.operators).selectinload(DeviceGroupOperator.user)
            )
            .order_by(DeviceGroup.name)
        )
        return list(result.scalars().all())

    async def create(self, group: DeviceGroup) -> DeviceGroup:
        self.db.add(group)
        await self.db.flush()
        return await self.get_by_id(group.id)

    async def update(self, group: DeviceGroup) -> DeviceGroup:
        await self.db.flush()
        return await self.get_by_id(group.id)

    async def delete(self, group: DeviceGroup):
        await self.db.delete(group)
        await self.db.flush()

    async def add_devices_to_group(self, group_id: UUID, device_ids: List[UUID]):
        for d_id in device_ids:
            existing = await self.db.execute(
                select(DeviceGroupMember).where(
                    DeviceGroupMember.group_id == group_id,
                    DeviceGroupMember.device_id == d_id
                )
            )
            if not existing.scalar_one_or_none():
                self.db.add(DeviceGroupMember(group_id=group_id, device_id=d_id))
        await self.db.flush()

    async def set_group_devices(self, group_id: UUID, device_ids: List[UUID]):
        await self.db.execute(
            delete(DeviceGroupMember).where(DeviceGroupMember.group_id == group_id)
        )
        for d_id in device_ids:
            self.db.add(DeviceGroupMember(group_id=group_id, device_id=d_id))
        await self.db.flush()

    async def remove_device_from_group(self, group_id: UUID, device_id: UUID):
        await self.db.execute(
            delete(DeviceGroupMember).where(
                DeviceGroupMember.group_id == group_id,
                DeviceGroupMember.device_id == device_id
            )
        )
        await self.db.flush()

    async def remove_device_from_all_groups(self, device_id: UUID):
        await self.db.execute(
            delete(DeviceGroupMember).where(DeviceGroupMember.device_id == device_id)
        )
        await self.db.flush()

    async def remove_devices_from_all_groups(self, device_ids: List[UUID]):
        if not device_ids:
            return
        await self.db.execute(
            delete(DeviceGroupMember).where(DeviceGroupMember.device_id.in_(device_ids))
        )
        await self.db.flush()

    async def get_group_device_ids(self, group_id: UUID) -> List[UUID]:
        result = await self.db.execute(
            select(DeviceGroupMember.device_id).where(DeviceGroupMember.group_id == group_id)
        )
        return list(result.scalars().all())

    async def set_group_operators(self, group_id: UUID, operator_ids: List[UUID]):
        await self.db.execute(
            delete(DeviceGroupOperator).where(DeviceGroupOperator.group_id == group_id)
        )
        for u_id in operator_ids:
            self.db.add(DeviceGroupOperator(group_id=group_id, user_id=u_id))
        await self.db.flush()

    async def get_operator_group_ids(self, user_id: UUID) -> List[UUID]:
        result = await self.db.execute(
            select(DeviceGroupOperator.group_id).where(DeviceGroupOperator.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_operator_device_ids(self, user_id: UUID) -> Set[UUID]:
        result = await self.db.execute(
            select(DeviceGroupMember.device_id)
            .join(DeviceGroupOperator, DeviceGroupMember.group_id == DeviceGroupOperator.group_id)
            .where(DeviceGroupOperator.user_id == user_id)
        )
        return set(result.scalars().all())

