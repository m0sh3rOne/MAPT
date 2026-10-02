from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.device import (
    DeviceResponse,
    DeviceInventoryResponse,
    DeviceTargetHistoryResponse,
    WolDeviceRequest,
    WolBatchRequest,
    WolCustomRequest,
    WolResultResponse,
    ActionCountResponse,
    DeviceBatchDeleteRequest
)
from app.core.security import UserRole
from app.services.device_service import DeviceService
from app.repositories.deployment_repository import DeploymentRepository
from app.models.audit import AuditLog, AuditAction
from app.models.deployment import TargetStatus
from app.api.deps import get_current_user, require_roles
from app.models.user import User

router = APIRouter(prefix="/devices", tags=["Admin - Machines"])


@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_all_devices()


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_device_by_id(device_id)


@router.get("/{device_id}/inventory", response_model=DeviceInventoryResponse | None)
async def get_device_inventory(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    return await service.get_device_inventory(device_id)


@router.get("/{device_id}/actions", response_model=List[DeviceTargetHistoryResponse])
async def get_device_actions(
    device_id: UUID,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    dep_repo = DeploymentRepository(db)
    targets = await dep_repo.get_targets_for_device(device_id, limit=limit)
    
    # 1. Historique des actions issues des déploiements
    history_items: List[DeviceTargetHistoryResponse] = [
        DeviceTargetHistoryResponse(
            id=t.id,
            deployment_id=t.deployment_id,
            deployment_name=t.deployment.name if t.deployment else "Action",
            deployment_type=t.deployment.deployment_type if t.deployment else "command",
            custom_command=t.deployment.custom_command if t.deployment else None,
            status=t.status,
            created_at=t.created_at,
            started_at=t.started_at,
            completed_at=t.completed_at,
            exit_code=t.exit_code,
            error_message=t.error_message
        )
        for t in targets
    ]

    # 2. Historique des actions de réveil Wake-on-LAN issues du journal d'audit
    wol_res = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == device_id,
            AuditLog.action == AuditAction.DEVICE_WOL
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    wol_logs = list(wol_res.scalars().all())

    for log in wol_logs:
        details = log.details or {}
        success = details.get("success", True)
        mac = details.get("mac_address", "")
        bcast = details.get("broadcast_ip", "")
        port = details.get("port", 9)
        summary_str = f"MAC: {mac} | Broadcast: {bcast}:{port}" if mac else f"Broadcast: {bcast}:{port}"
        
        history_items.append(
            DeviceTargetHistoryResponse(
                id=log.id,
                deployment_id=None,
                deployment_name="⚡ Réveil à distance (Wake-on-LAN)",
                deployment_type="wol",
                custom_command=summary_str,
                status=TargetStatus.SUCCEEDED if success else TargetStatus.FAILED,
                created_at=log.created_at,
                started_at=log.created_at,
                completed_at=log.created_at,
                exit_code=0 if success else 1,
                error_message=None if success else details.get("message")
            )
        )

    # Trier l'historique complet combiné par horodatage décroissant
    history_items.sort(
        key=lambda item: item.created_at if item.created_at else datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    return history_items[:limit]


@router.delete("/{device_id}/actions", response_model=ActionCountResponse)
async def clear_device_actions(
    device_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Efface l'historique de toutes les actions, déploiements et réveils WoL sur cette machine.
    """
    dep_repo = DeploymentRepository(db)
    count = await dep_repo.clear_device_actions(device_id)

    wol_res = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == device_id,
            AuditLog.action == AuditAction.DEVICE_WOL
        )
    )
    wol_logs = list(wol_res.scalars().all())
    for wl in wol_logs:
        await db.delete(wl)
    count += len(wol_logs)

    await db.commit()
    return ActionCountResponse(
        success=True,
        count=count,
        message=f"{count} action(s) et journaux associés supprimés de l'historique."
    )


@router.delete("/{device_id}/actions/{target_id}", response_model=ActionCountResponse)
async def delete_device_action(
    device_id: UUID,
    target_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Supprime une action spécifique (déploiement ou WoL) de l'historique de cette machine.
    """
    dep_repo = DeploymentRepository(db)
    deleted = await dep_repo.delete_target_by_id(target_id)
    if not deleted:
        al_res = await db.execute(
            select(AuditLog).where(
                AuditLog.id == target_id,
                AuditLog.entity_id == device_id,
                AuditLog.action == AuditAction.DEVICE_WOL
            )
        )
        al = al_res.scalar_one_or_none()
        if al:
            await db.delete(al)
            deleted = True

    if not deleted:
        raise HTTPException(status_code=404, detail="Action introuvable dans l'historique.")
    await db.commit()
    return ActionCountResponse(
        success=True,
        count=1,
        message="Action supprimée de l'historique."
    )


@router.post("/{device_id}/enable", response_model=DeviceResponse)
async def enable_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.set_device_status(device_id, True, current_user.id, client_ip)


@router.post("/{device_id}/disable", response_model=DeviceResponse)
async def disable_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.set_device_status(device_id, False, current_user.id, client_ip)


@router.delete("/{device_id}")
async def delete_device(
    device_id: UUID,
    request: Request,
    uninstall_agent: bool = True,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    await service.delete_device(device_id, current_user.id, client_ip, uninstall_agent=uninstall_agent)
    return {"status": "success", "message": "Ordre de désinstallation de l'agent envoyé et machine supprimée du parc."}


@router.post("/batch-delete")
async def delete_devices_batch(
    request: Request,
    payload: DeviceBatchDeleteRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Supprime un lot de machines du parc, les retire de leurs groupes et désinstalle l'agent si demandé.
    """
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    count = await service.delete_devices_batch(
        payload.device_ids,
        current_user.id,
        client_ip,
        uninstall_agent=payload.uninstall_agent
    )
    return {
        "status": "success",
        "count": count,
        "message": f"{count} machine(s) supprimée(s) du parc et retirée(s) des groupes."
    }


@router.post("/{device_id}/wol")
async def wake_device(
    device_id: UUID,
    request: Request,
    payload: Optional[WolDeviceRequest] = None,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN pour réveiller la machine cible et consigne l'audit.
    """
    from app.services.wol_service import WolService
    wol_svc = WolService(db)
    b_ip = payload.broadcast_ip if payload else None
    port = payload.port if payload else None
    client_ip = request.client.host if request.client else None
    return await wol_svc.wake_device(
        device_id,
        broadcast_ip=b_ip,
        port=port,
        user_id=current_user.id,
        ip_address=client_ip
    )


@router.post("/wol/batch")
async def wake_devices_batch(
    request: Request,
    payload: WolBatchRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN pour réveiller une sélection de machines et consigne l'audit.
    """
    from app.services.wol_service import WolService
    wol_svc = WolService(db)
    client_ip = request.client.host if request.client else None
    return await wol_svc.wake_devices(
        payload.device_ids,
        broadcast_ip=payload.broadcast_ip,
        port=payload.port,
        user_id=current_user.id,
        ip_address=client_ip
    )


@router.post("/wol/custom")
async def wake_custom_mac(
    request: Request,
    payload: WolCustomRequest,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Envoie un paquet magique Wake-on-LAN vers une adresse MAC personnalisée et consigne l'audit.
    """
    from app.services.wol_service import send_magic_packet
    from app.repositories.audit_repository import AuditRepository
    from app.models.audit import AuditAction

    port = payload.port or 9
    res = send_magic_packet(payload.mac_address, broadcast_ip=payload.broadcast_ip, ports=(port,))
    client_ip = request.client.host if request.client else None

    audit_repo = AuditRepository(db)
    await audit_repo.create(
        action=AuditAction.DEVICE_WOL,
        entity_type="custom_mac",
        user_id=current_user.id,
        details={
            "mac_address": res.get("mac_address", payload.mac_address),
            "broadcast_ip": payload.broadcast_ip or "255.255.255.255",
            "port": port,
            "success": res.get("success", True),
            "packets_sent": res.get("packets_sent", 0),
            "message": res.get("message")
        },
        ip_address=client_ip
    )
    return res

