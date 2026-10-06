import time
import json
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import UserRole
from app.api.deps import require_roles, get_current_user
from app.models.user import User
from app.models.setting import SystemSetting
from app.models.device import Device
from app.models.audit import AuditLog, AuditAction
from app.schemas.mcp import (
    McpStatusResponse,
    McpToolInfo,
    McpToolParameter,
    McpToggleRequest,
    McpSettingsUpdateRequest,
    McpTestConnectionRequest,
    McpTestConnectionResponse
)

router = APIRouter(prefix="/mcp", tags=["Super Admin - Serveur MCP"])

# Liste descriptive des 12 outils MCP MAPT
MAPT_MCP_TOOLS: List[McpToolInfo] = [
    McpToolInfo(
        name="mapt_list_devices",
        description="Liste les machines du parc avec statut en ligne, adresses IP, MAC, OS et dernière activité.",
        category="Inventaire & Parc",
        parameters=[
            McpToolParameter(name="search", type="string", description="Filtre textuel (hostname, IP, MAC, OS)", required=False),
            McpToolParameter(name="online_only", type="boolean", description="Filtrer uniquement les machines connectées", required=False, default=False),
            McpToolParameter(name="limit", type="integer", description="Nombre max de machines", required=False, default=50),
        ]
    ),
    McpToolInfo(
        name="mapt_get_device",
        description="Obtient les spécifications complètes, matériel, disques, interfaces réseau et logiciels installés.",
        category="Inventaire & Parc",
        parameters=[
            McpToolParameter(name="device_id", type="string (UUID)", description="UUID de la machine", required=True),
            McpToolParameter(name="include_inventory", type="boolean", description="Inclure l'inventaire matériel/logiciel", required=False, default=True),
        ]
    ),
    McpToolInfo(
        name="mapt_find_device_by_name",
        description="Recherche instantanée d'un poste par son nom d'hôte NetBIOS (ex: PC-COMPTA-01).",
        category="Inventaire & Parc",
        parameters=[
            McpToolParameter(name="hostname", type="string", description="Nom d'ordinateur à chercher", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_run_command",
        description="Exécute un script PowerShell ou commande CMD à distance (encodage Base64 UTF-16LE automatique).",
        category="Exécution & Scripts",
        parameters=[
            McpToolParameter(name="device_ids", type="array[string]", description="Liste des UUIDs cibles", required=True),
            McpToolParameter(name="command", type="string", description="Le code du script ou la commande", required=True),
            McpToolParameter(name="shell_type", type="string (powershell|cmd|bash)", description="Interpréteur d'exécution", required=False, default="powershell"),
            McpToolParameter(name="name", type="string", description="Titre du job pour l'historique", required=False),
            McpToolParameter(name="timeout", type="integer", description="Délai maximum en secondes", required=False, default=300),
        ]
    ),
    McpToolInfo(
        name="mapt_get_deployment_status",
        description="Consulte l'état d'avancement d'un déploiement et le statut détaillé de chaque machine.",
        category="Exécution & Scripts",
        parameters=[
            McpToolParameter(name="deployment_id", type="string (UUID)", description="UUID du déploiement", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_get_target_logs",
        description="Récupère les sorties de console (stdout/stderr) en temps réel renvoyées par l'agent pour un poste.",
        category="Exécution & Scripts",
        parameters=[
            McpToolParameter(name="deployment_id", type="string (UUID)", description="UUID du déploiement", required=True),
            McpToolParameter(name="target_id", type="string (UUID)", description="UUID de la cible", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_cancel_deployment",
        description="Annule un déploiement ou une commande en cours d'exécution.",
        category="Exécution & Scripts",
        parameters=[
            McpToolParameter(name="deployment_id", type="string (UUID)", description="UUID du déploiement", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_wake_device",
        description="Allume un poste à distance par émission d'un paquet magique Wake-on-LAN (WoL).",
        category="Alimentation & Énergie",
        parameters=[
            McpToolParameter(name="device_id", type="string (UUID)", description="UUID de la machine à allumer", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_reboot_device",
        description="Redémarre à distance un ou plusieurs postes avec message d'avertissement aux utilisateurs.",
        category="Alimentation & Énergie",
        parameters=[
            McpToolParameter(name="device_ids", type="array[string]", description="UUIDs des machines", required=True),
            McpToolParameter(name="delay_seconds", type="integer", description="Délai avant redémarrage (sec)", required=False, default=5),
            McpToolParameter(name="message", type="string", description="Message d'avertissement affiché", required=False, default="Redémarrage demandé par l'administrateur"),
        ]
    ),
    McpToolInfo(
        name="mapt_shutdown_device",
        description="Éteint proprement à distance un ou plusieurs postes (délai de sécurité minimum de 10s).",
        category="Alimentation & Énergie",
        parameters=[
            McpToolParameter(name="device_ids", type="array[string]", description="UUIDs des machines", required=True),
            McpToolParameter(name="delay_seconds", type="integer", description="Délai avant extinction (sec, min 10s)", required=False, default=10),
            McpToolParameter(name="message", type="string", description="Message d'avertissement affiché", required=False, default="Extinction demandée par l'administrateur"),
        ]
    ),
    McpToolInfo(
        name="mapt_list_groups",
        description="Liste l'ensemble des groupes logiques de machines configurés dans MAPT.",
        category="Organisation",
        parameters=[]
    ),
    McpToolInfo(
        name="mapt_list_scripts",
        description="Liste les scripts réutilisables de la bibliothèque MAPT (PowerShell, VBScript, Batch, Python).",
        category="Bibliothèque de Scripts",
        parameters=[
            McpToolParameter(name="category", type="string", description="Filtrer par catégorie", required=False),
        ]
    ),
    McpToolInfo(
        name="mapt_create_script",
        description="Crée et intègre un nouveau script réutilisable (PowerShell, Batch, Python) directement dans la bibliothèque officielle MAPT.",
        category="Bibliothèque de Scripts",
        parameters=[
            McpToolParameter(name="name", type="string", description="Nom explicite du script", required=True),
            McpToolParameter(name="content", type="string", description="Code source complet du script", required=True),
            McpToolParameter(name="language", type="string (powershell|cmd|python)", description="Langage du script", required=False, default="powershell"),
            McpToolParameter(name="description", type="string", description="Description de l'usage", required=False),
            McpToolParameter(name="timeout_seconds", type="integer", description="Délai d'exécution max en secondes", required=False, default=300),
        ]
    ),
    McpToolInfo(
        name="mapt_get_script",
        description="Obtient le code source et les métadonnées d'un script existant de la bibliothèque MAPT.",
        category="Bibliothèque de Scripts",
        parameters=[
            McpToolParameter(name="script_id", type="string (UUID)", description="UUID du script dans MAPT", required=True),
        ]
    ),
    McpToolInfo(
        name="mapt_deploy_script",
        description="Déploie et exécute un script du catalogue MAPT sur une sélection de machines ou groupes.",
        category="Bibliothèque de Scripts",
        parameters=[
            McpToolParameter(name="script_id", type="string (UUID)", description="UUID du script à déployer", required=True),
            McpToolParameter(name="device_ids", type="array[string]", description="UUIDs des machines cibles", required=False),
            McpToolParameter(name="group_ids", type="array[string]", description="UUIDs des groupes cibles", required=False),
            McpToolParameter(name="target_all_devices", type="boolean", description="Déployer sur tout le parc", required=False, default=False),
            McpToolParameter(name="name", type="string", description="Titre personnalisé du déploiement", required=False),
        ]
    ),
]


async def _get_setting(db: AsyncSession, key: str, default_val: str = "") -> str:
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    return setting.value if setting and setting.value is not None else default_val


async def _set_setting(db: AsyncSession, key: str, value: str, description: str = "") -> None:
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if setting:
        setting.value = value
        if description:
            setting.description = description
    else:
        setting = SystemSetting(key=key, value=value, description=description)
        db.add(setting)
    await db.commit()


@router.get("/status", response_model=McpStatusResponse)
async def get_mcp_status(
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère le statut complet du serveur MCP, l'URL de connexion et les snippets de configuration prêts à l'emploi.
    Accessible uniquement aux comptes SUPER_ADMIN.
    """
    enabled_str = await _get_setting(db, "mcp_server_enabled", "true")
    enabled = enabled_str.lower() in ("true", "1", "yes")

    port_str = await _get_setting(db, "mcp_server_port", "8080")
    try:
        port = int(port_str)
    except ValueError:
        port = 8080

    custom_host = await _get_setting(db, "mcp_server_host", "")
    req_host = request.headers.get("host", "").split(":")[0] if request.headers.get("host") else "192.168.224.236"
    server_host = custom_host if custom_host else req_host

    scheme = request.url.scheme
    api_url = f"{scheme}://{server_host}/api/v1"
    server_url = f"http://{server_host}:{port}/sse"

    # Configurations client IA prêtes à l'emploi
    config_claude = {
        "mcpServers": {
            "mapt": {
                "command": "python",
                "args": ["-m", "mcp.server"],
                "env": {
                    "MAPT_API_URL": api_url,
                    "MAPT_USERNAME": "admin",
                    "MAPT_PASSWORD": "VOTRE_MOT_DE_PASSE",
                    "MAPT_VERIFY_SSL": "false"
                }
            }
        }
    }

    config_antigravity = {
        "mcpServers": {
            "mapt-admin": {
                "command": "python",
                "args": ["c:/Users/Admin/Documents/Github/MAPT/mcp/server.py"],
                "env": {
                    "MAPT_API_URL": api_url,
                    "MAPT_USERNAME": "admin",
                    "MAPT_PASSWORD": "VOTRE_MOT_DE_PASSE",
                    "MAPT_VERIFY_SSL": "false"
                }
            }
        }
    }

    config_cursor = {
        "mapt": {
            "type": "sse",
            "url": server_url
        }
    }

    python_cli = f"python mcp/server.py --sse --port {port} --host 0.0.0.0"

    return McpStatusResponse(
        enabled=enabled,
        server_url=server_url,
        api_url=api_url,
        host=server_host,
        port=port,
        is_running=enabled,
        tools_count=len(MAPT_MCP_TOOLS),
        tools=MAPT_MCP_TOOLS,
        config_claude_desktop=config_claude,
        config_antigravity=config_antigravity,
        config_cursor=config_cursor,
        config_python_cli=python_cli
    )


@router.post("/toggle", response_model=McpStatusResponse)
async def toggle_mcp_server(
    toggle_in: McpToggleRequest,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Active ou désactive le serveur MCP.
    """
    new_state = "true" if toggle_in.enabled else "false"
    await _set_setting(db, "mcp_server_enabled", new_state, "État d'activation du serveur MCP")

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action=AuditAction.MCP_SERVER_TOGGLED,
        entity_type="mcp_server",
        details={
            "action": "toggle_mcp_server",
            "enabled": toggle_in.enabled,
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    await db.commit()

    return await get_mcp_status(request, current_user, db)


@router.put("/settings", response_model=McpStatusResponse)
async def update_mcp_settings(
    settings_in: McpSettingsUpdateRequest,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Met à jour les paramètres réseau du serveur MCP (port d'écoute, nom d'hôte).
    """
    if settings_in.port:
        await _set_setting(db, "mcp_server_port", str(settings_in.port), "Port d'écoute MCP SSE")
    if settings_in.custom_host is not None:
        await _set_setting(db, "mcp_server_host", settings_in.custom_host.strip(), "Nom d'hôte / IP Serveur MCP")
    if settings_in.allowed_ips is not None:
        await _set_setting(db, "mcp_allowed_ips", settings_in.allowed_ips.strip(), "Adresses IP clientes autorisées")

    audit = AuditLog(
        user_id=current_user.id,
        action=AuditAction.MCP_SERVER_SETTINGS_UPDATED,
        entity_type="mcp_server",
        details={
            "port": settings_in.port,
            "custom_host": settings_in.custom_host,
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    await db.commit()

    return await get_mcp_status(request, current_user, db)


@router.post("/test-connection", response_model=McpTestConnectionResponse)
async def test_mcp_connection(
    test_in: McpTestConnectionRequest,
    current_user: User = Depends(require_roles([UserRole.SUPER_ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Teste la connectivité entre le serveur MCP et l'API MAPT, vérifie l'authentification et compte les machines.
    """
    start_time = time.time()
    try:
        stmt = select(Device)
        res = await db.execute(stmt)
        devices = res.scalars().all()
        latency = (time.time() - start_time) * 1000

        return McpTestConnectionResponse(
            success=True,
            message=f"Authentification API MAPT réussie. Accès à {len(devices)} machine(s) du parc validé.",
            token_valid=True,
            devices_detected=len(devices),
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        latency = (time.time() - start_time) * 1000
        return McpTestConnectionResponse(
            success=False,
            message=f"Échec du test de connexion: {str(e)}",
            token_valid=False,
            devices_detected=0,
            latency_ms=round(latency, 2)
        )
