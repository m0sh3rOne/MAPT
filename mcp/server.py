#!/usr/bin/env python3
"""
MAPT MCP (Model Context Protocol) Server
========================================
Serveur MCP officiel pour l'administration et le pilotage du parc informatique MAPT (Modern Asset & Package Tracker).

Ce serveur permet à des assistants IA (Claude Desktop, Google Antigravity, Cursor, etc.)
d'interagir de manière sécurisée avec l'API MAPT pour :
- Consulter le parc et l'inventaire matériel/logiciel
- Lancer des commandes et scripts distants (avec encodage PowerShell UTF-16LE)
- Contrôler l'alimentation (Wake-on-LAN, Redémarrage, Extinction)
- Gérer les déploiements et consulter les logs d'exécution en temps réel
"""

import sys
import os
import json
import base64
import urllib.request
import urllib.error
import ssl
import logging
import argparse
from typing import Any, Dict, List, Optional

# Configuration des logs
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [MAPT-MCP] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger("mapt-mcp")

# Configuration par défaut
DEFAULT_API_URL = os.environ.get("MAPT_API_URL", "http://192.168.224.236/api/v1").rstrip("/")
DEFAULT_USERNAME = os.environ.get("MAPT_USERNAME", "admin")
DEFAULT_PASSWORD = os.environ.get("MAPT_PASSWORD", "***REDACTED***")
DEFAULT_VERIFY_SSL = os.environ.get("MAPT_VERIFY_SSL", "false").lower() in ("true", "1", "yes")


class MaptApiClient:
    """Client REST pour l'API MAPT avec gestion de session et rafraîchissement automatique de token."""

    def __init__(
        self,
        base_url: str = DEFAULT_API_URL,
        username: str = DEFAULT_USERNAME,
        password: str = DEFAULT_PASSWORD,
        verify_ssl: bool = DEFAULT_VERIFY_SSL
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl
        self.token: Optional[str] = None

        # Contexte SSL
        self.ssl_context = ssl.create_default_context()
        if not self.verify_ssl:
            self.ssl_context.check_hostname = False
            self.ssl_context.verify_mode = ssl.CERT_NONE

    def login(self) -> str:
        """Authentifie le client auprès de MAPT et stocke le token JWT."""
        url = f"{self.base_url}/auth/login"
        payload = json.dumps({
            "username": self.username,
            "password": self.password
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "MAPT-MCP-Server/1.0.0"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, context=self.ssl_context, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.token = data.get("access_token")
                if not self.token:
                    raise ValueError("Pas d'access_token retourné par MAPT.")
                logger.info(f"Authentification réussie auprès de MAPT pour l'utilisateur '{self.username}'")
                return self.token
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"Échec de connexion à MAPT ({e.code}): {err_body}")
            raise RuntimeError(f"Erreur d'authentification MAPT HTTP {e.code}: {err_body}")
        except Exception as e:
            logger.error(f"Impossible de joindre MAPT sur {url}: {e}")
            raise RuntimeError(f"Erreur de connexion MAPT: {str(e)}")

    def request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]] = None, params: Optional[Dict[str, Any]] = None) -> Any:
        """Effectue une requête sécurisée vers l'API MAPT avec reprise sur 401."""
        if not self.token:
            self.login()

        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        if params:
            query_parts = []
            for k, v in params.items():
                if v is not None:
                    query_parts.append(f"{k}={urllib.request.quote(str(v))}")
            if query_parts:
                url += "?" + "&".join(query_parts)

        payload_bytes = json.dumps(data).encode("utf-8") if data is not None else None

        for attempt in range(2):
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "User-Agent": "MAPT-MCP-Server/1.0.0"
            }
            req = urllib.request.Request(url, data=payload_bytes, headers=headers, method=method.upper())

            try:
                with urllib.request.urlopen(req, context=self.ssl_context, timeout=30) as resp:
                    resp_body = resp.read().decode("utf-8")
                    if not resp_body:
                        return None
                    return json.loads(resp_body)
            except urllib.error.HTTPError as e:
                if e.code == 401 and attempt == 0:
                    logger.warning("Token expiré (401). Ré-authentification...")
                    self.login()
                    continue
                err_text = e.read().decode("utf-8", errors="ignore")
                logger.error(f"Erreur API MAPT {method} {url} [{e.code}]: {err_text}")
                raise RuntimeError(f"Erreur MAPT {e.code} sur {endpoint}: {err_text}")
            except Exception as e:
                logger.error(f"Erreur réseau MAPT {method} {url}: {e}")
                raise RuntimeError(f"Erreur réseau MAPT: {str(e)}")


client = MaptApiClient()


# =============================================================================
# OUTILS MCP (TOOLS) IMPLEMENTATION
# =============================================================================

def encode_powershell_base64(script: str) -> str:
    """Encode un script PowerShell en UTF-16LE Base64 pour exécution bypass."""
    utf16_bytes = script.encode("utf-16-le")
    return base64.b64encode(utf16_bytes).decode("ascii")


def tool_list_devices(search: Optional[str] = None, online_only: bool = False, limit: int = 50) -> Dict[str, Any]:
    """Liste les machines du parc MAPT avec filtres de recherche et statut en ligne."""
    devices = client.request("GET", "/admin/devices")
    if not isinstance(devices, list):
        return {"devices": [], "count": 0}

    filtered = []
    for d in devices:
        if online_only and not d.get("is_online", False):
            continue
        if search:
            q = search.lower()
            hostname = (d.get("hostname") or "").lower()
            ip = (d.get("ip_address") or "").lower()
            mac = (d.get("mac_address") or "").lower()
            os_n = (d.get("os_name") or "").lower()
            prev_host = (d.get("previous_hostname") or "").lower()
            if q not in hostname and q not in ip and q not in mac and q not in os_n and q not in prev_host:
                continue
        filtered.append({
            "id": d.get("id"),
            "device_uuid": d.get("device_uuid"),
            "hostname": d.get("hostname"),
            "previous_hostname": d.get("previous_hostname"),
            "ip_address": d.get("ip_address"),
            "mac_address": d.get("mac_address"),
            "os_name": d.get("os_name"),
            "os_version": d.get("os_version"),
            "agent_version": d.get("agent_version"),
            "is_online": d.get("is_online"),
            "is_approved": d.get("is_approved"),
            "enabled": d.get("enabled"),
            "last_seen_at": d.get("last_seen_at")
        })

    total_matched = len(filtered)
    return {
        "devices": filtered[:limit],
        "count": len(filtered[:limit]),
        "total_matched": total_matched,
        "online_count": sum(1 for d in filtered if d.get("is_online")),
        "offline_count": sum(1 for d in filtered if not d.get("is_online"))
    }


def tool_get_device(device_id: str, include_inventory: bool = True) -> Dict[str, Any]:
    """Récupère les détails complets d'une machine et son inventaire matériel/logiciel."""
    dev = client.request("GET", f"/admin/devices/{device_id}")
    res = {"device": dev}

    if include_inventory:
        try:
            inv = client.request("GET", f"/admin/devices/{device_id}/inventory")
            res["inventory"] = inv
        except Exception as e:
            res["inventory_error"] = str(e)

    return res


def tool_find_device_by_name(hostname: str) -> Dict[str, Any]:
    """Recherche une machine spécifique par son nom d'hôte NetBIOS/DNS."""
    devices = client.request("GET", "/admin/devices")
    q = hostname.strip().lower()
    matches = []

    for d in (devices or []):
        host = (d.get("hostname") or "").lower()
        prev = (d.get("previous_hostname") or "").lower()
        if host == q or prev == q:
            matches.append(d)

    if not matches:
        # Recherche partielle si exact match non trouvé
        for d in (devices or []):
            host = (d.get("hostname") or "").lower()
            if q in host:
                matches.append(d)

    if not matches:
        return {"found": False, "message": f"Aucune machine trouvée pour le nom '{hostname}'"}

    return {
        "found": True,
        "match_count": len(matches),
        "devices": matches
    }


def tool_run_command(
    device_ids: List[str],
    command: str,
    shell_type: str = "powershell",
    name: Optional[str] = None,
    timeout: int = 300
) -> Dict[str, Any]:
    """Exécute une commande ou un script à distance sur un ou plusieurs postes avec encodage PowerShell sécurisé."""
    if not device_ids:
        raise ValueError("Au moins un device_id cible doit être spécifié.")

    shell = (shell_type or "powershell").lower()
    custom_cmd = command

    # RÈGLE CRITIQUE : Encodage UTF-16LE Base64 pour PowerShell
    if shell in ("powershell", "ps1", "ps"):
        encoded = encode_powershell_base64(command)
        custom_cmd = f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}"
    elif shell == "cmd":
        custom_cmd = command
    elif shell == "bash":
        custom_cmd = f"bash -c {urllib.request.quote(command)}"

    job_name = name or f"Commande MCP ({shell}) - {len(device_ids)} cible(s)"
    payload = {
        "name": job_name,
        "description": f"Exécution à distance initiée via le serveur MCP (type: {shell}, timeout: {timeout}s)",
        "deployment_type": "command",
        "custom_command": custom_cmd,
        "status": "RUNNING",
        "schedule_type": "immediate",
        "target_device_ids": device_ids,
        "target_all_devices": False,
        "target_group_ids": []
    }

    resp = client.request("POST", "/admin/deployments", data=payload)
    return {
        "success": True,
        "message": f"Déploiement '{job_name}' créé avec succès.",
        "deployment_id": resp.get("id"),
        "status": resp.get("status"),
        "targets_count": len(device_ids),
        "raw_response": resp
    }


def tool_get_deployment_status(deployment_id: str) -> Dict[str, Any]:
    """Récupère le statut d'un déploiement et l'état détaillé de chaque machine cible."""
    dep = client.request("GET", f"/admin/deployments/{deployment_id}")
    targets = client.request("GET", f"/admin/deployments/{deployment_id}/targets")

    summary = {
        "deployment_id": deployment_id,
        "name": dep.get("name"),
        "status": dep.get("status"),
        "created_at": dep.get("created_at"),
        "total_targets": len(targets) if targets else 0,
        "completed": 0,
        "failed": 0,
        "running": 0,
        "pending": 0,
        "targets": []
    }

    for t in (targets or []):
        st = (t.get("status") or "").upper()
        if st in ("COMPLETED", "SUCCEEDED", "SUCCESS"):
            summary["completed"] += 1
        elif st in ("FAILED", "ERROR"):
            summary["failed"] += 1
        elif st in ("RUNNING", "OFFERED", "IN_PROGRESS"):
            summary["running"] += 1
        else:
            summary["pending"] += 1

        summary["targets"].append({
            "target_id": t.get("id"),
            "device_id": t.get("device_id"),
            "status": t.get("status"),
            "exit_code": t.get("exit_code"),
            "started_at": t.get("started_at"),
            "finished_at": t.get("finished_at"),
            "error_message": t.get("error_message")
        })

    return summary


def tool_get_target_logs(deployment_id: str, target_id: str) -> Dict[str, Any]:
    """Récupère les logs console complets renvoyés par l'agent pour une cible donnée."""
    logs = client.request("GET", f"/admin/deployments/{deployment_id}/targets/{target_id}/logs")
    log_lines = []
    for l in (logs or []):
        msg = l.get("message") or ""
        log_lines.append(msg)

    return {
        "deployment_id": deployment_id,
        "target_id": target_id,
        "logs_count": len(logs or []),
        "raw_logs": logs,
        "full_text": "\n".join(log_lines)
    }


def tool_cancel_deployment(deployment_id: str) -> Dict[str, Any]:
    """Annule un déploiement en cours d'exécution."""
    resp = client.request("POST", f"/admin/deployments/{deployment_id}/cancel")
    return {
        "success": True,
        "message": f"Déploiement {deployment_id} annulé.",
        "deployment": resp
    }


def tool_wake_device(device_id: str) -> Dict[str, Any]:
    """Envoie un paquet magique Wake-on-LAN pour allumer une machine hors ligne."""
    resp = client.request("POST", f"/admin/devices/{device_id}/wol")
    return {
        "success": True,
        "message": f"Ordre Wake-on-LAN émis pour la machine {device_id}.",
        "result": resp
    }


def tool_reboot_device(
    device_ids: List[str],
    delay_seconds: int = 5,
    message: str = "Redémarrage demandé par l'administrateur MAPT"
) -> Dict[str, Any]:
    """Redémarre à distance un ou plusieurs postes Windows ou Linux."""
    safe_delay = max(0, delay_seconds)
    safe_msg = message.replace('"', '""')
    cmd = f'shutdown.exe /r /t {safe_delay} /f /c "{safe_msg}"'

    return tool_run_command(
        device_ids=device_ids,
        command=cmd,
        shell_type="cmd",
        name=f"🔄 Redémarrage ({len(device_ids)} poste(s))"
    )


def tool_shutdown_device(
    device_ids: List[str],
    delay_seconds: int = 10,
    message: str = "Extinction demandée par l'administrateur MAPT"
) -> Dict[str, Any]:
    """Éteint à distance un ou plusieurs postes (délai minimum de 10s pour accusé de réception)."""
    # Toujours imposer au minimum 10s de délai pour permettre à l'agent d'envoyer le statut SUCCEEDED
    safe_delay = max(10, delay_seconds)
    safe_msg = message.replace('"', '""')
    cmd = f'shutdown.exe /s /t {safe_delay} /f /c "{safe_msg}"'

    return tool_run_command(
        device_ids=device_ids,
        command=cmd,
        shell_type="cmd",
        name=f"⚡ Arrêt système ({len(device_ids)} poste(s))"
    )


def tool_list_groups() -> Dict[str, Any]:
    """Liste tous les groupes logiques de machines dans MAPT."""
    groups = client.request("GET", "/admin/groups")
    return {
        "groups": groups,
        "count": len(groups or [])
    }


def tool_list_scripts(category: Optional[str] = None) -> Dict[str, Any]:
    """Liste les scripts réutilisables disponibles dans la bibliothèque MAPT."""
    scripts = client.request("GET", "/admin/scripts")
    filtered = []
    for s in (scripts or []):
        if category and (s.get("category") or "").lower() != category.lower():
            continue
        filtered.append({
            "id": s.get("id"),
            "name": s.get("name"),
            "description": s.get("description"),
            "category": s.get("category"),
            "language": s.get("language"),
            "latest_version": s.get("latest_version")
        })

    return {
        "scripts": filtered,
        "count": len(filtered)
    }


def tool_create_script(
    name: str,
    content: str,
    language: str = "powershell",
    description: Optional[str] = None,
    timeout_seconds: int = 300
) -> Dict[str, Any]:
    """Crée et enregistre un nouveau script directement dans la bibliothèque officielle MAPT."""
    lang = (language or "powershell").lower()
    payload = {
        "name": name.strip(),
        "description": description or f"Script créé par IA via MCP ({lang})",
        "language": lang,
        "initial_content": content,
        "timeout_seconds": timeout_seconds
    }
    resp = client.request("POST", "/admin/scripts", data=payload)
    latest_v = resp.get("latest_version") or {}
    return {
        "success": True,
        "message": f"Script '{name}' ({lang}) créé et intégré avec succès dans la bibliothèque MAPT.",
        "script_id": resp.get("id"),
        "script_version_id": latest_v.get("id"),
        "name": resp.get("name"),
        "language": resp.get("language")
    }


def tool_get_script(script_id: str) -> Dict[str, Any]:
    """Récupère les détails et le code source complet d'un script du catalogue MAPT."""
    script = client.request("GET", f"/admin/scripts/{script_id}")
    latest_v = script.get("latest_version") or {}
    return {
        "id": script.get("id"),
        "name": script.get("name"),
        "description": script.get("description"),
        "language": script.get("language"),
        "version": latest_v.get("version"),
        "code_content": latest_v.get("content", ""),
        "created_at": script.get("created_at")
    }


def tool_deploy_script(
    script_id: str,
    device_ids: Optional[List[str]] = None,
    group_ids: Optional[List[str]] = None,
    target_all_devices: bool = False,
    name: Optional[str] = None
) -> Dict[str, Any]:
    """Déploie un script du catalogue MAPT sur un ensemble de machines ou groupes cibles."""
    script = client.request("GET", f"/admin/scripts/{script_id}")
    latest_v = script.get("latest_version")
    if not latest_v or not latest_v.get("id"):
        raise ValueError(f"Le script '{script.get('name')}' ne dispose d'aucune version disponible.")

    job_name = name or f"Déploiement Script : {script.get('name')}"
    payload = {
        "name": job_name,
        "description": f"Exécution du script de bibliothèque '{script.get('name')}'",
        "deployment_type": "script",
        "script_version_id": latest_v.get("id"),
        "target_all_devices": target_all_devices,
        "target_device_ids": device_ids or [],
        "target_group_ids": group_ids or [],
        "schedule_type": "immediate",
        "is_recurring": False
    }

    resp = client.request("POST", "/admin/deployments", data=payload)
    return {
        "success": True,
        "message": f"Déploiement du script '{script.get('name')}' lancé.",
        "deployment_id": resp.get("id"),
        "status": resp.get("status"),
        "raw_response": resp
    }


# Dictionnaire de métadonnées des outils MCP
MCP_TOOLS = {
    "mapt_list_devices": {
        "name": "mapt_list_devices",
        "description": "Liste les ordinateurs enregistrés dans MAPT avec leurs adresses IP, statut en ligne, OS et date de dernière vue.",
        "func": tool_list_devices,
        "inputSchema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Filtre de recherche (nom d'hôte, IP, MAC, OS)"},
                "online_only": {"type": "boolean", "description": "Si vrai, retourne uniquement les machines actuellement connectées"},
                "limit": {"type": "integer", "description": "Nombre maximum de machines à retourner", "default": 50}
            }
        }
    },
    "mapt_get_device": {
        "name": "mapt_get_device",
        "description": "Obtient les informations détaillées d'une machine et son inventaire matériel/logiciel complet.",
        "func": tool_get_device,
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string", "description": "UUID de la machine dans MAPT"},
                "include_inventory": {"type": "boolean", "description": "Inclure l'inventaire matériel/logiciel complet", "default": True}
            },
            "required": ["device_id"]
        }
    },
    "mapt_find_device_by_name": {
        "name": "mapt_find_device_by_name",
        "description": "Recherche une machine par son nom d'hôte NetBIOS (ex: '043C-CPE1-PC01') et retourne son UUID.",
        "func": tool_find_device_by_name,
        "inputSchema": {
            "type": "object",
            "properties": {
                "hostname": {"type": "string", "description": "Nom NetBIOS ou hostname de la machine"}
            },
            "required": ["hostname"]
        }
    },
    "mapt_run_command": {
        "name": "mapt_run_command",
        "description": "Exécute une commande personnalisée ou un script PowerShell/CMD à distance sur une ou plusieurs machines.",
        "func": tool_run_command,
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Liste des UUIDs des machines cibles"
                },
                "command": {"type": "string", "description": "Le script ou la commande à exécuter"},
                "shell_type": {
                    "type": "string",
                    "enum": ["powershell", "cmd", "bash"],
                    "description": "Interpréteur cible (powershell est automatiquement encodé en Base64 UTF-16LE)",
                    "default": "powershell"
                },
                "name": {"type": "string", "description": "Titre du job pour l'historique"},
                "timeout": {"type": "integer", "description": "Délai maximum d'exécution en secondes", "default": 300}
            },
            "required": ["device_ids", "command"]
        }
    },
    "mapt_get_deployment_status": {
        "name": "mapt_get_deployment_status",
        "description": "Vérifie l'avancement et le statut d'un déploiement ou d'une commande (RUNNING, COMPLETED, FAILED).",
        "func": tool_get_deployment_status,
        "inputSchema": {
            "type": "object",
            "properties": {
                "deployment_id": {"type": "string", "description": "UUID du déploiement"}
            },
            "required": ["deployment_id"]
        }
    },
    "mapt_get_target_logs": {
        "name": "mapt_get_target_logs",
        "description": "Récupère les sorties de console (stdout/stderr) d'une exécution de script pour une machine spécifique.",
        "func": tool_get_target_logs,
        "inputSchema": {
            "type": "object",
            "properties": {
                "deployment_id": {"type": "string", "description": "UUID du déploiement"},
                "target_id": {"type": "string", "description": "UUID de la cible spécifique"}
            },
            "required": ["deployment_id", "target_id"]
        }
    },
    "mapt_cancel_deployment": {
        "name": "mapt_cancel_deployment",
        "description": "Annule un déploiement en cours d'exécution.",
        "func": tool_cancel_deployment,
        "inputSchema": {
            "type": "object",
            "properties": {
                "deployment_id": {"type": "string", "description": "UUID du déploiement à annuler"}
            },
            "required": ["deployment_id"]
        }
    },
    "mapt_wake_device": {
        "name": "mapt_wake_device",
        "description": "Allume un ordinateur à distance via Wake-on-LAN (paquet magique).",
        "func": tool_wake_device,
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string", "description": "UUID de la machine à réveiller"}
            },
            "required": ["device_id"]
        }
    },
    "mapt_reboot_device": {
        "name": "mapt_reboot_device",
        "description": "Redémarre à distance un ou plusieurs ordinateurs du parc avec message d'information.",
        "func": tool_reboot_device,
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Liste des UUIDs des machines à redémarrer"
                },
                "delay_seconds": {"type": "integer", "description": "Délai avant redémarrage en secondes", "default": 5},
                "message": {"type": "string", "description": "Message affiché aux utilisateurs", "default": "Redémarrage demandé par l'administrateur"}
            },
            "required": ["device_ids"]
        }
    },
    "mapt_shutdown_device": {
        "name": "mapt_shutdown_device",
        "description": "Éteint à distance un ou plusieurs ordinateurs du parc (délai de sécurité minimum de 10s).",
        "func": tool_shutdown_device,
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Liste des UUIDs des machines à éteindre"
                },
                "delay_seconds": {"type": "integer", "description": "Délai avant coupure en secondes (min 10s)", "default": 10},
                "message": {"type": "string", "description": "Message affiché aux utilisateurs", "default": "Extinction demandée par l'administrateur"}
            },
            "required": ["device_ids"]
        }
    },
    "mapt_list_groups": {
        "name": "mapt_list_groups",
        "description": "Liste les groupes logiques de machines créés dans MAPT.",
        "func": tool_list_groups,
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    "mapt_list_scripts": {
        "name": "mapt_list_scripts",
        "description": "Liste les scripts de la bibliothèque MAPT prêts à être déployés.",
        "func": tool_list_scripts,
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filtrer par catégorie (ex: Maintenance, Sécurité, Diagnostic)"}
            }
        }
    },
    "mapt_create_script": {
        "name": "mapt_create_script",
        "description": "Crée et intègre un nouveau script réutilisable (PowerShell, Batch, Python) directement dans la bibliothèque officielle MAPT.",
        "func": tool_create_script,
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nom explicite du script (ex: 'Nettoyage Spooler & DNS')"},
                "content": {"type": "string", "description": "Code source complet du script à exécuter"},
                "language": {"type": "string", "enum": ["powershell", "cmd", "python", "vbscript"], "description": "Langage de script (défaut: powershell)", "default": "powershell"},
                "description": {"type": "string", "description": "Description détaillée de l'utilité du script"},
                "timeout_seconds": {"type": "integer", "description": "Délai d'exécution maximum en secondes", "default": 300}
            },
            "required": ["name", "content"]
        }
    },
    "mapt_get_script": {
        "name": "mapt_get_script",
        "description": "Obtient le code source et les métadonnées d'un script existant de la bibliothèque MAPT.",
        "func": tool_get_script,
        "inputSchema": {
            "type": "object",
            "properties": {
                "script_id": {"type": "string", "description": "UUID du script dans MAPT"}
            },
            "required": ["script_id"]
        }
    },
    "mapt_deploy_script": {
        "name": "mapt_deploy_script",
        "description": "Déploie et exécute un script existant de la bibliothèque MAPT sur une ou plusieurs machines ou groupes.",
        "func": tool_deploy_script,
        "inputSchema": {
            "type": "object",
            "properties": {
                "script_id": {"type": "string", "description": "UUID du script du catalogue à déployer"},
                "device_ids": {"type": "array", "items": {"type": "string"}, "description": "Liste des UUIDs des machines cibles"},
                "group_ids": {"type": "array", "items": {"type": "string"}, "description": "Liste des UUIDs des groupes de machines cibles"},
                "target_all_devices": {"type": "boolean", "description": "Déployer sur l'intégralité du parc", "default": False},
                "name": {"type": "string", "description": "Titre personnalisé du déploiement"}
            },
            "required": ["script_id"]
        }
    }
}


# =============================================================================
# PROTOCOLE MCP STDIO & SERVEUR HTTP / SSE
# =============================================================================

def handle_json_rpc(req_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Traite un message JSON-RPC 2.0 selon la spécification Model Context Protocol."""
    method = req_data.get("method")
    req_id = req_data.get("id")
    params = req_data.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "mapt-mcp-server",
                    "version": "1.0.0"
                }
            }
        }

    elif method == "notifications/initialized":
        logger.info("Session MCP initialisée avec succès.")
        return None

    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {}
        }

    elif method == "tools/list":
        tools_list = []
        for t in MCP_TOOLS.values():
            tools_list.append({
                "name": t["name"],
                "description": t["description"],
                "inputSchema": t["inputSchema"]
            })
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": tools_list
            }
        }

    elif method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})

        if tool_name not in MCP_TOOLS:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Outil '{tool_name}' non reconnu par le serveur MAPT-MCP."
                }
            }

        tool_entry = MCP_TOOLS[tool_name]
        try:
            func = tool_entry["func"]
            res = func(**args)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(res, indent=2, ensure_ascii=False)
                        }
                    ]
                }
            }
        except Exception as e:
            logger.error(f"Erreur lors de l'exécution de l'outil '{tool_name}': {e}")
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "isError": True,
                    "content": [
                        {
                            "type": "text",
                            "text": f"Erreur d'exécution de l'outil '{tool_name}': {str(e)}"
                        }
                    ]
                }
            }

    else:
        if req_id is not None:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Méthode non implémentée: {method}"
                }
            }
        return None


def run_stdio():
    """Exécute le serveur MCP en mode standard input/output (stdio)."""
    logger.info("Serveur MAPT-MCP démarré en mode stdio.")
    logger.info(f"Connexion ciblée vers MAPT API : {client.base_url} (Utilisateur: {client.username})")

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue

            req_obj = json.loads(line)
            resp = handle_json_rpc(req_obj)
            if resp is not None:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            logger.error(f"Erreur boucle stdio: {e}")


def run_sse(host: str = "0.0.0.0", port: int = 8080):
    """Exécute le serveur MCP en mode HTTP / SSE pour connexions réseau distantes."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class McpHttpHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

        def do_GET(self):
            if self.path in ("/", "/health", "/status"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                status_payload = {
                    "status": "online",
                    "service": "MAPT Model Context Protocol (MCP) Server",
                    "version": "1.0.0",
                    "mapt_api_url": client.base_url,
                    "tools_count": len(MCP_TOOLS),
                    "tools": list(MCP_TOOLS.keys())
                }
                self.wfile.write(json.dumps(status_payload, indent=2).encode("utf-8"))
            elif self.path.startswith("/sse"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                endpoint_event = f"event: endpoint\ndata: /messages\n\n"
                self.wfile.write(endpoint_event.encode("utf-8"))
                self.wfile.flush()
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            if self.path in ("/", "/mcp", "/messages"):
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                try:
                    req_obj = json.loads(body)
                    resp = handle_json_rpc(req_obj)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    if resp is not None:
                        self.wfile.write(json.dumps(resp).encode("utf-8"))
                    else:
                        self.wfile.write(b"{}")
                except Exception as e:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            else:
                self.send_response(404)
                self.end_headers()

    server = HTTPServer((host, port), McpHttpHandler)
    logger.info(f"Serveur MAPT-MCP en écoute sur http://{host}:{port}")
    logger.info(f"Endpoint SSE : http://{host}:{port}/sse")
    try:
        server.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Arrêt du serveur MCP...")
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="MAPT Model Context Protocol (MCP) Server")
    parser.add_argument("--sse", action="store_true", help="Démarrer le serveur en mode HTTP/SSE")
    parser.add_argument("--port", type=int, default=8080, help="Port d'écoute HTTP/SSE (défaut: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Hôte d'écoute HTTP/SSE (défaut: 0.0.0.0)")
    parser.add_argument("--test-auth", action="store_true", help="Tester la connexion à l'API MAPT et quitter")

    args = parser.parse_args()

    if args.test_auth:
        try:
            token = client.login()
            print(f"[OK] Connexion réussie à MAPT ({client.base_url}) ! Token généré avec succès.")
            devs = tool_list_devices(limit=5)
            print(f"[OK] Test inventaire : {devs.get('total_matched', 0)} machine(s) détectée(s).")
            sys.exit(0)
        except Exception as e:
            print(f"[ERREUR] Échec du test de connexion: {e}", file=sys.stderr)
            sys.exit(1)

    if args.sse:
        run_sse(host=args.host, port=args.port)
    else:
        run_stdio()


if __name__ == "__main__":
    main()
