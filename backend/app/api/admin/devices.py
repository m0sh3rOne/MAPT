from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.schemas.device import (
    DeviceResponse,
    DeviceUpdate,
    DeviceInventoryResponse,
    DeviceTargetHistoryResponse,
    DeviceTargetLogItem,
    WolDeviceRequest,
    WolBatchRequest,
    WolCustomRequest,
    WolResultResponse,
    ActionCountResponse,
    DeviceBatchDeleteRequest,
    DeviceBatchApproveRequest
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
    limit: int = 100,
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
            error_message=t.error_message,
            logs=[
                DeviceTargetLogItem(
                    id=l.id,
                    timestamp=l.timestamp,
                    level=l.level,
                    message=l.message
                )
                for l in (t.logs or [])
            ]
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
        wol_msg = f"Paquet magique Wake-on-LAN diffusé avec succès sur le réseau ({summary_str})." if success else (details.get("message") or "Échec d'envoi du paquet magique Wake-on-LAN.")
        
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
                error_message=None if success else details.get("message"),
                logs=[
                    DeviceTargetLogItem(
                        id=log.id,
                        timestamp=log.created_at,
                        level="INFO" if success else "ERROR",
                        message=wol_msg
                    )
                ]
            )
        )

    # Trier l'historique complet combiné par horodatage décroissant
    history_items.sort(
        key=lambda item: item.created_at if item.created_at else datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    return history_items[:limit]


@router.get("/{device_id}/execution-logs/export")
async def export_device_execution_logs(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Exporte l'ensemble des logs d'exécution de déploiements et actions pour une machine sous format fichier texte .txt.
    """
    service = DeviceService(db)
    device = await service.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Machine introuvable")

    dep_repo = DeploymentRepository(db)
    targets = await dep_repo.get_targets_for_device(device_id, limit=200)

    now = datetime.now(timezone.utc)
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    formatted_now = now.strftime("%d/%m/%Y à %H:%M:%S UTC")

    lines = []
    lines.append("=" * 80)
    lines.append(f" RAPPORT DES LOGS D'EXÉCUTION & DÉPLOIEMENTS - MACHINE : {device.hostname}")
    lines.append(f" Date d'export : {formatted_now}")
    lines.append(f" IP : {device.ip_address or 'N/A'} | OS : {device.os_name} {device.os_version or ''}")
    lines.append(f" Nombre total d'exécutions enregistrées : {len(targets)}")
    lines.append("=" * 80)
    lines.append("")

    for idx, t in enumerate(targets, 1):
        dep_name = t.deployment.name if t.deployment else "Action Rapide"
        dep_type = t.deployment.deployment_type if t.deployment else "command"
        created_str = t.created_at.strftime("%d/%m/%Y %H:%M:%S") if t.created_at else "N/A"
        started_str = t.started_at.strftime("%d/%m/%Y %H:%M:%S") if t.started_at else "-"
        completed_str = t.completed_at.strftime("%d/%m/%Y %H:%M:%S") if t.completed_at else "-"
        exit_code_str = str(t.exit_code) if t.exit_code is not None else "N/A"

        lines.append(f"[{idx}/{len(targets)}] {created_str} | {dep_name} | STATUT: {t.status} | CODE RETOUR: {exit_code_str}")
        lines.append(f" Type      : {dep_type}")
        lines.append(f" Début     : {started_str} | Fin : {completed_str}")
        if t.deployment and t.deployment.custom_command:
            lines.append(f" Commande  : {t.deployment.custom_command}")
        if t.error_message:
            lines.append(f" Erreur    : {t.error_message}")
        
        lines.append(" --- SORTIE CONSOLE & LOGS ---")
        if t.logs and len(t.logs) > 0:
            for log in t.logs:
                l_time = log.timestamp.strftime("%H:%M:%S") if log.timestamp else ""
                lines.append(f" [{l_time}] [{log.level}] {log.message}")
        else:
            lines.append(" (Aucune sortie textuelle enregistrée pour cette exécution)")
        lines.append("-" * 80)
        lines.append("")

    content = "\n".join(lines)
    filename = f"mapt_execution_logs_{device.hostname}_{timestamp_str}.txt"

    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


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


@router.post("/{device_id}/approve", response_model=DeviceResponse)
async def approve_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Approuve administrativement une machine pour l'intégrer pleinement au parc actif.
    """
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.approve_device(device_id, current_user.id, client_ip)


@router.post("/{device_id}/unapprove", response_model=DeviceResponse)
async def unapprove_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Passe une machine sous le statut Non approuvé.
    """
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    return await service.unapprove_device(device_id, current_user.id, client_ip)


@router.post("/batch-approve")
async def approve_devices_batch(
    request: Request,
    payload: DeviceBatchApproveRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Approuve un lot de machines sélectionnées en une seule opération.
    """
    service = DeviceService(db)
    client_ip = request.client.host if request.client else None
    count = await service.approve_devices_batch(payload.device_ids, current_user.id, client_ip)
    return {
        "status": "success",
        "count": count,
        "message": f"{count} machine(s) approuvée(s) avec succès."
    }


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


@router.post("/{device_id}/acknowledge-rename", response_model=DeviceResponse)
async def acknowledge_device_rename(
    device_id: UUID,
    delete_old_records: bool = True,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Acquitte le renommage d'une machine et supprime si demandé les anciens enregistrements fantômes / inactifs.
    """
    service = DeviceService(db)
    dev_model = await service.device_repo.get_by_id(device_id)
    if not dev_model:
        raise HTTPException(status_code=404, detail="Machine introuvable")

    old_name = dev_model.previous_hostname
    dev_model.previous_hostname = None
    dev_model.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dev_model)

    if delete_old_records and old_name:
        try:
            from sqlalchemy import select
            from app.models.device import Device
            old_devices_res = await db.execute(
                select(Device).where(
                    Device.hostname.ilike(old_name),
                    Device.id != dev_model.id
                )
            )
            old_devices = list(old_devices_res.scalars().all())
            for old_dev in old_devices:
                await service.group_repo.remove_device_from_all_groups(old_dev.id)
                await db.delete(old_dev)
            if old_devices:
                await db.commit()
        except Exception as e:
            from app.core.logging import logger
            logger.warning(f"Erreur lors de la purge des anciens enregistrements pour {old_name}: {e}")

    await service.audit_repo.create(
        action=AuditAction.DEVICE_RENAMED,
        entity_type="device",
        user_id=current_user.id,
        entity_id=dev_model.id,
        details={
            "action": "acknowledge_rename",
            "hostname": dev_model.hostname,
            "previous_hostname": old_name,
            "purged_old_records": delete_old_records
        }
    )
    await db.commit()

    return service._map_to_response(dev_model)


@router.post("/{device_id}/sync-wins-name", response_model=DeviceResponse)
async def sync_device_wins_name(
    device_id: UUID,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Synchronise le nommage dans MAPT (hostname) avec le nom WINS / NetBIOS réel de la machine.
    """
    service = DeviceService(db)
    dev_model = await service.device_repo.get_by_id(device_id)
    if not dev_model:
        raise HTTPException(status_code=404, detail="Machine introuvable")

    wins_name = dev_model.wins_name
    if not wins_name and dev_model.inventory and dev_model.inventory.local_users:
        for u in dev_model.inventory.local_users:
            if isinstance(u, dict) and u.get("account_type") == "Local" and u.get("domain"):
                d = str(u.get("domain")).strip()
                if d and d.upper() not in ["BUILTIN", "AUTORITE NT", "NT AUTHORITY"]:
                    wins_name = d
                    break

    if not wins_name:
        raise HTTPException(status_code=400, detail="Nom WINS non disponible pour cette machine.")

    old_mapt_name = dev_model.hostname
    new_mapt_name = wins_name.strip()

    if old_mapt_name != new_mapt_name:
        dev_model.previous_hostname = old_mapt_name
        dev_model.hostname = new_mapt_name
        dev_model.wins_name = new_mapt_name
        await db.commit()
        await db.refresh(dev_model)

        await service.audit_repo.create(
            action=AuditAction.DEVICE_RENAMED,
            entity_type="device",
            entity_id=dev_model.id,
            user_id=current_user.id,
            details={
                "old_hostname": old_mapt_name,
                "new_hostname": new_mapt_name,
                "source": "sync_wins_name"
            }
        )

    return service._map_to_response(dev_model)


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: UUID,
    payload: DeviceUpdate,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    """
    Met à jour les informations d'une machine (ex: renommage du nommage MAPT).
    """
    service = DeviceService(db)
    dev_model = await service.device_repo.get_by_id(device_id)
    if not dev_model:
        raise HTTPException(status_code=404, detail="Machine introuvable")

    if payload.hostname and payload.hostname.strip():
        new_name = payload.hostname.strip()
        if new_name != dev_model.hostname:
            dev_model.previous_hostname = dev_model.hostname
            dev_model.hostname = new_name
            await db.commit()
            await db.refresh(dev_model)
            await service.audit_repo.create(
                action=AuditAction.DEVICE_RENAMED,
                entity_type="device",
                entity_id=dev_model.id,
                user_id=current_user.id,
                details={
                    "old_hostname": dev_model.previous_hostname,
                    "new_hostname": new_name,
                    "source": "manual_admin_update"
                }
            )

    return service._map_to_response(dev_model)


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

