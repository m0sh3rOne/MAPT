from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, delete
from sqlalchemy.orm import selectinload
from app.models.device import Device
from app.models.inventory import DeviceInventory
from app.models.group import DeviceGroupMember


class DeviceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, device_id: UUID) -> Optional[Device]:
        result = await self.db.execute(
            select(Device)
            .options(
                selectinload(Device.inventory),
                selectinload(Device.group_memberships)
            )
            .where(Device.id == device_id, Device.is_archived == False)
        )
        return result.scalar_one_or_none()

    async def get_by_uuid(self, device_uuid: UUID) -> Optional[Device]:
        result = await self.db.execute(
            select(Device)
            .options(
                selectinload(Device.inventory),
                selectinload(Device.group_memberships)
            )
            .where(Device.device_uuid == device_uuid)
        )
        return result.scalar_one_or_none()

    async def get_by_token(self, agent_token: str) -> Optional[Device]:
        result = await self.db.execute(
            select(Device)
            .where(Device.agent_token == agent_token, Device.is_archived == False)
        )
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 500, enabled_only: bool = False) -> List[Device]:
        query = (
            select(Device)
            .options(
                selectinload(Device.inventory),
                selectinload(Device.group_memberships)
            )
            .where(Device.is_archived == False)
            .order_by(Device.hostname)
        )
        if enabled_only:
            query = query.where(Device.enabled == True)
        result = await self.db.execute(query.offset(skip).limit(limit))
        return list(result.scalars().all())

    async def create(self, device: Device) -> Device:
        self.db.add(device)
        await self.db.flush()
        await self.db.refresh(device)
        return device

    async def update(self, device: Device) -> Device:
        await self.db.flush()
        await self.db.refresh(device)
        return device

    async def update_last_seen(self, device_id: UUID, ip_address: Optional[str] = None, agent_version: Optional[str] = None):
        values = {"last_seen_at": datetime.now(timezone.utc)}
        if ip_address:
            values["ip_address"] = ip_address
        if agent_version:
            values["agent_version"] = agent_version
        await self.db.execute(
            update(Device).where(Device.id == device_id).values(**values)
        )

    async def upsert_inventory(self, device_id: UUID, inventory_data: dict) -> DeviceInventory:
        result = await self.db.execute(select(DeviceInventory).where(DeviceInventory.device_id == device_id))
        inventory = result.scalar_one_or_none()
        if not inventory:
            inventory = DeviceInventory(device_id=device_id, **inventory_data)
            self.db.add(inventory)
        else:
            for k, v in inventory_data.items():
                if v is not None:
                    setattr(inventory, k, v)
            inventory.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return inventory

    async def get_inventory(self, device_id: UUID) -> Optional[DeviceInventory]:
        result = await self.db.execute(select(DeviceInventory).where(DeviceInventory.device_id == device_id))
        return result.scalar_one_or_none()

    async def count(self) -> int:
        result = await self.db.execute(select(func.count(Device.id)).where(Device.is_archived == False))
        return result.scalar() or 0
