from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.group import DeviceGroup
from app.models.audit import AuditAction
from app.repositories.group_repository import GroupRepository
from app.repositories.audit_repository import AuditRepository
from app.schemas.device import DeviceGroupCreate, DeviceGroupResponse


class GroupService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.group_repo = GroupRepository(db)
        self.audit_repo = AuditRepository(db)

    def _map_to_response(self, group: DeviceGroup) -> DeviceGroupResponse:
        device_ids = []
        if "members" in group.__dict__ and group.members is not None:
            device_ids = [m.device_id for m in group.members]
        return DeviceGroupResponse(
            id=group.id,
            name=group.name,
            description=group.description,
            device_count=len(device_ids),
            device_ids=device_ids,
            created_at=group.created_at
        )

    async def get_all_groups(self) -> List[DeviceGroupResponse]:
        groups = await self.group_repo.get_all()
        return [self._map_to_response(g) for g in groups]

    async def get_group_by_id(self, group_id: UUID) -> DeviceGroupResponse:
        group = await self.group_repo.get_by_id(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Groupe introuvable.")
        return self._map_to_response(group)

    async def create_group(self, group_in: DeviceGroupCreate, user_id: UUID, ip_address: Optional[str] = None) -> DeviceGroupResponse:
        existing = await self.group_repo.get_by_name(group_in.name)
        if existing:
            raise HTTPException(status_code=400, detail="Un groupe avec ce nom existe déjà.")

        group = DeviceGroup(name=group_in.name, description=group_in.description)
        created = await self.group_repo.create(group)

        await self.audit_repo.create(
            action=AuditAction.GROUP_CREATED,
            entity_type="group",
            user_id=user_id,
            entity_id=created.id,
            details={"name": created.name},
            ip_address=ip_address
        )
        return self._map_to_response(created)

    async def update_group(self, group_id: UUID, group_in: DeviceGroupCreate, user_id: UUID, ip_address: Optional[str] = None) -> DeviceGroupResponse:
        group = await self.group_repo.get_by_id(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Groupe introuvable.")

        if group_in.name != group.name:
            existing = await self.group_repo.get_by_name(group_in.name)
            if existing and existing.id != group_id:
                raise HTTPException(status_code=400, detail="Un groupe avec ce nom existe déjà.")

        group.name = group_in.name
        group.description = group_in.description
        updated = await self.group_repo.update(group)

        await self.audit_repo.create(
            action=AuditAction.GROUP_UPDATED,
            entity_type="group",
            user_id=user_id,
            entity_id=group_id,
            details={"name": updated.name},
            ip_address=ip_address
        )
        return self._map_to_response(updated)

    async def delete_group(self, group_id: UUID, user_id: UUID, ip_address: Optional[str] = None):
        group = await self.group_repo.get_by_id(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Groupe introuvable.")
        await self.group_repo.delete(group)

        await self.audit_repo.create(
            action=AuditAction.GROUP_DELETED,
            entity_type="group",
            user_id=user_id,
            entity_id=group_id,
            details={"name": group.name},
            ip_address=ip_address
        )

    async def add_devices_to_group(self, group_id: UUID, device_ids: List[UUID]):
        group = await self.group_repo.get_by_id(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Groupe introuvable.")
        await self.group_repo.add_devices_to_group(group_id, device_ids)

    async def set_group_devices(self, group_id: UUID, device_ids: List[UUID]):
        group = await self.group_repo.get_by_id(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Groupe introuvable.")
        await self.group_repo.set_group_devices(group_id, device_ids)

    async def remove_device_from_group(self, group_id: UUID, device_id: UUID):
        await self.group_repo.remove_device_from_group(group_id, device_id)
