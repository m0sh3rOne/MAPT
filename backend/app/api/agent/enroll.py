from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import FileResponse
import os
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.agent import AgentEnrollRequest, AgentEnrollResponse, AgentHeartbeatRequest, AgentHeartbeatResponse
from app.services.agent_service import AgentService
from app.api.deps import get_current_agent
from app.models.device import Device

router = APIRouter(tags=["Agent - Protocole"])


@router.post("/enroll", response_model=AgentEnrollResponse)
async def enroll_agent(
    enroll_in: AgentEnrollRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    client_ip = request.client.host if request.client else None
    return await service.enroll_agent(enroll_in, ip_address=client_ip)


@router.post("/heartbeat", response_model=AgentHeartbeatResponse)
async def heartbeat(
    heartbeat_in: AgentHeartbeatRequest,
    request: Request,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    client_ip = request.client.host if request.client else None
    return await service.process_heartbeat(device, heartbeat_in, ip_address=client_ip)


@router.get("/download/windows")
async def download_windows_agent():
    """
    Téléchargement direct du binaire Windows mapt-agent.exe
    """
    candidate_paths = [
        "/app/static/mapt-agent.exe",
        "/app/mapt-agent.exe",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../agent/mapt-agent.exe")),
        "/mnt/c/Users/Admin/Documents/Github/MAPT/agent/mapt-agent.exe",
        os.path.abspath("agent/mapt-agent.exe"),
    ]

    for p in candidate_paths:
        if os.path.exists(p) and os.path.isfile(p):
            return FileResponse(
                path=p,
                filename="mapt-agent.exe",
                media_type="application/vnd.microsoft.portable-executable"
            )

    raise HTTPException(status_code=404, detail="Binaire mapt-agent.exe non trouvé sur le serveur.")
