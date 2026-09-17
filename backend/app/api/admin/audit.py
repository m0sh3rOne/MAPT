from typing import List
from uuid import UUID
from datetime import datetime, timezone
import json
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import UserRole
from app.schemas.audit import AuditLogResponse, BulkDeleteAuditLogsRequest, AuditActionCountResponse
from app.repositories.audit_repository import AuditRepository
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["Admin - Audit"])


@router.get("", response_model=List[AuditLogResponse])
async def list_audit_logs(
    skip: int = 0,
    limit: int = 500,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = AuditRepository(db)
    logs = await repo.get_all(skip=skip, limit=limit)
    return [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_username=log.user.username if log.user else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at
        )
        for log in logs
    ]


@router.get("/export")
async def export_audit_logs(
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Exporte l'intégralité des journaux d'audit au format texte brut structuré (.txt).
    """
    repo = AuditRepository(db)
    logs = await repo.get_all(skip=0, limit=5000)
    
    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"mapt_audit_logs_{timestamp_str}.txt"

    lines = []
    lines.append("=" * 100)
    lines.append(f" MAPT - JOURNAL D'AUDIT & TRAÇABILITÉ DU PARC INFORMATIQUE")
    lines.append(f" Exporté le : {datetime.now(timezone.utc).isoformat()} UTC par {current_user.username}")
    lines.append(f" Nombre total d'événements : {len(logs)}")
    lines.append("=" * 100)
    lines.append("")

    for log in logs:
        user_display = log.user.username if log.user else "SYSTÈME/AGENT"
        date_str = log.created_at.isoformat() if log.created_at else "UNKNOWN_DATE"
        ip_str = log.ip_address or "127.0.0.1"
        details_str = json.dumps(log.details, ensure_ascii=False) if log.details else "-"
        lines.append(f"[{date_str}] [IP: {ip_str:<15}] [UTILISATEUR: {user_display:<15}] [ACTION: {log.action:<25}] [ENTITÉ: {log.entity_type} {log.entity_id or ''}]")
        if log.details:
            lines.append(f"   ↳ DÉTAILS : {details_str}")
        lines.append("-" * 100)

    content = "\n".join(lines)
    return PlainTextResponse(
        content=content,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/plain; charset=utf-8"
        }
    )


@router.delete("/clear", response_model=AuditActionCountResponse)
async def clear_all_audit_logs(
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN, UserRole.ADMINISTRATOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Purge l'intégralité des journaux d'audit (Super Admin / Admin).
    """
    repo = AuditRepository(db)
    count = await repo.clear_all()
    await db.commit()
    return AuditActionCountResponse(
        success=True,
        count=count,
        message=f"{count} événement(s) du journal d'audit ont été purgés avec succès."
    )


@router.post("/bulk-delete", response_model=AuditActionCountResponse)
async def bulk_delete_audit_logs(
    req: BulkDeleteAuditLogsRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Supprime une sélection de journaux d'audit.
    """
    repo = AuditRepository(db)
    count = await repo.delete_bulk(req.log_ids)
    await db.commit()
    return AuditActionCountResponse(
        success=True,
        count=count,
        message=f"{count} événement(s) sélectionné(s) ont été supprimés avec succès."
    )


@router.delete("/{log_id}", response_model=AuditActionCountResponse)
async def delete_audit_log(
    log_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Supprime un événement d'audit individuel.
    """
    repo = AuditRepository(db)
    deleted = await repo.delete_by_id(log_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Événement d'audit introuvable.")
    await db.commit()
    return AuditActionCountResponse(
        success=True,
        count=1,
        message="Événement d'audit supprimé."
    )
