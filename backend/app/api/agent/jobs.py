from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.agent import (
    AgentJobPayload, AgentJobAckRequest, AgentJobProgressRequest,
    AgentJobCompleteRequest, AgentJobFailRequest, BatchLogsCreate
)
from app.services.agent_service import AgentService
from app.api.deps import get_current_agent
from app.models.device import Device

router = APIRouter(tags=["Agent - Jobs"])


@router.get("/jobs", response_model=List[AgentJobPayload])
async def get_jobs(
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    return await service.get_jobs_for_agent(device)


@router.post("/jobs/{job_id}/ack")
async def ack_job(
    job_id: UUID,
    req: AgentJobAckRequest,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.ack_job(device, job_id)
    return {"status": "success", "message": "Job acquitté"}


@router.post("/jobs/{job_id}/progress")
async def progress_job(
    job_id: UUID,
    req: AgentJobProgressRequest,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.progress_job(device, job_id, req.progress, req.message)
    return {"status": "success"}


@router.post("/jobs/{job_id}/logs")
async def add_job_logs(
    job_id: UUID,
    req: BatchLogsCreate,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.add_job_logs(device, job_id, req.logs)
    return {"status": "success", "count": len(req.logs)}


@router.post("/jobs/{job_id}/complete")
async def complete_job(
    job_id: UUID,
    req: AgentJobCompleteRequest,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.complete_job(device, job_id, req.exit_code, req.duration_seconds, req.output)
    return {"status": "success"}


@router.post("/jobs/{job_id}/fail")
async def fail_job(
    job_id: UUID,
    req: AgentJobFailRequest,
    device: Device = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db)
):
    service = AgentService(db)
    await service.fail_job(device, job_id, req.exit_code, req.error, req.output)
    return {"status": "success"}
