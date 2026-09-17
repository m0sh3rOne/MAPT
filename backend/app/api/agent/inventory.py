from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.device import DeviceInventoryUpdate
from app.services.agent_service import AgentService
from app.api.deps import get_current_agent
from app.models.device import Device

router = APIRouter(tags=["Agent - Inventaire"])


@router.post("/inventory")
async def update_inventory(
    inventory_in: DeviceInventoryUpdate,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.update_inventory(device, inventory_in)
    return {"status": "success", "message": "Inventaire mis à jour"}
