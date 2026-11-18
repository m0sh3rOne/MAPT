import asyncio
import base64
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID

import redis.asyncio as aioredis
import websockets
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.logging import logger
from app.core.security import UserRole, decode_token, verify_password
from app.models.user import User
from app.repositories.deployment_repository import DeploymentRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.user_repository import UserRepository
from app.schemas.deployment import DeploymentCreate
from app.services.deployment_service import DeploymentService
from app.services.device_service import DeviceService

router = APIRouter(prefix="/devices", tags=["Admin - AppMirror"])

APPMIRROR_EXPECTED_SIZE = 11620352
DEFAULT_MIRROR_PORT = 8080


def _get_appmirror_binary_info() -> tuple[int, str]:
    candidates = [
        "/app/agent/appmirror-backend.exe",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "agent", "appmirror-backend.exe")),
    ]
    for path in candidates:
        if os.path.isfile(path):
            h = hashlib.sha256()
            size = 0
            with open(path, "rb") as f:
                while chunk := f.read(1024 * 1024):
                    size += len(chunk)
                    h.update(chunk)
            return size, h.hexdigest().upper()
    return APPMIRROR_EXPECTED_SIZE, ""


class MirrorStartRequest(BaseModel):
    mode: Literal["headless", "gui"] = "headless"
    port: int = Field(default=DEFAULT_MIRROR_PORT, ge=1024, le=65535)
    web_username: Optional[str] = None
    web_password: Optional[str] = None
    pin: str = "1234"
    allow_full_desktop: bool = True
    allow_virtual_desktop: bool = True
    expose_all_apps: bool = True
    force_reinstall: bool = False


class MirrorStatusResponse(BaseModel):
    device_id: UUID
    hostname: str
    ip_address: Optional[str] = None
    port: int = DEFAULT_MIRROR_PORT
    running: bool = False
    mode: Optional[str] = None
    web_username: Optional[str] = None
    has_password: bool = False
    allow_full_desktop: bool = True
    allow_virtual_desktop: bool = True
    expose_all_apps: bool = True
    started_at: Optional[str] = None
    last_action_id: Optional[UUID] = None
    last_action_name: Optional[str] = None
    last_action_status: Optional[str] = None
    last_action_error: Optional[str] = None
    last_action_created_at: Optional[datetime] = None
    direct_url: Optional[str] = None


def _get_redis_client() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


def _mirror_redis_key(device_id: UUID) -> str:
    return f"mapt:mirror:config:{device_id}"


async def _load_mirror_config(device_id: UUID) -> dict:
    try:
        client = _get_redis_client()
        try:
            raw = await client.get(_mirror_redis_key(device_id))
            if raw:
                return json.loads(raw)
        finally:
            await client.aclose()
    except Exception as e:
        logger.warning(f"Impossible de lire la configuration AppMirror dans Redis pour {device_id}: {e}")
    return {}


async def _save_mirror_config(device_id: UUID, data: dict) -> None:
    try:
        client = _get_redis_client()
        try:
            await client.set(_mirror_redis_key(device_id), json.dumps(data), ex=60 * 60 * 24 * 30)
        finally:
            await client.aclose()
    except Exception as e:
        logger.warning(f"Impossible de sauvegarder la configuration AppMirror dans Redis pour {device_id}: {e}")


async def _check_device_permission(db: AsyncSession, current_user: User, device_id: UUID) -> None:
    if current_user.role == UserRole.OPERATOR:
        group_repo = GroupRepository(db)
        allowed_ids = await group_repo.get_operator_device_ids(current_user.id)
        if device_id not in allowed_ids:
            raise HTTPException(
                status_code=403,
                detail="Accès refusé : cette machine n'appartient à aucun de vos groupes assignés.",
            )


async def _probe_tcp_port(host: Optional[str], port: int, timeout: float = 1.2) -> bool:
    if not host or host.startswith("127.") or host.startswith("169.254.") or host.startswith("172.18."):
        return False
    try:
        conn = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True
    except Exception:
        return False


def _encode_ps_utf16(script: str) -> str:
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def _ps_single_quote(val: str) -> str:
    return val.replace("'", "''")


def _build_start_mirror_command(
    download_url: str,
    mode: str,
    port: int,
    web_username: str,
    web_password: str,
    pin: str,
    allow_full_desktop: bool,
    allow_virtual_desktop: bool,
    expose_all_apps: bool,
    force_reinstall: bool = False,
) -> str:
    expected_size, expected_sha256 = _get_appmirror_binary_info()
    config_obj = {
        "pin": pin or "1234",
        "locked_apps": [],
        "launcher_locked": False,
        "server_port": port,
        "allow_full_desktop": allow_full_desktop,
        "allow_virtual_desktop": allow_virtual_desktop,
        "expose_all_apps": expose_all_apps,
        "exposed_apps": [],
        "web_auth_enabled": True,
        "web_username": web_username,
        "web_password": web_password,
    }
    config_b64 = base64.b64encode(json.dumps(config_obj, indent=2).encode("utf-8")).decode("ascii")
    extra_args = "--headless" if mode == "headless" else ""

    ps_script = f"""$ErrorActionPreference = 'Stop'
$baseDir = 'C:\\ProgramData\\MAPT\\appmirror'
$exePath = Join-Path $baseDir 'appmirror-backend.exe'
$dlUrl = '{_ps_single_quote(download_url)}'
$cfgBytes = [Convert]::FromBase64String('{config_b64}')
$cfgJson = [System.Text.Encoding]::UTF8.GetString($cfgBytes)
$port = {port}
$modeArgs = '{extra_args}'

if (-not (Test-Path $baseDir)) {{ New-Item -ItemType Directory -Path $baseDir -Force | Out-Null }}

# 1. Arret des instances existantes
Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400

# 2. Telechargement du binaire si absent, taille/SHA256 different ou remplacement force
$needDownload = $true
$forceReinstall = ${str(force_reinstall).lower()}
if ($forceReinstall -and (Test-Path $exePath)) {{
    Write-Output '[MAPT] Remplacement force : suppression de l ancien binaire appmirror-backend.exe...'
    Remove-Item -Path $exePath -Force -ErrorAction SilentlyContinue
}}
if (-not $forceReinstall -and (Test-Path $exePath)) {{
    $len = (Get-Item $exePath).Length
    if ($len -eq {expected_size}) {{
        if ('{expected_sha256}' -eq '') {{
            $needDownload = $false
        }} else {{
            try {{
                $sha = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.IO.File]::ReadAllBytes($exePath))).Replace('-', '').ToUpperInvariant()
                if ($sha -eq '{expected_sha256}') {{ $needDownload = $false }}
            }} catch {{}}
        }}
    }}
}}
if ($needDownload) {{
    Write-Output '[MAPT] Telechargement de appmirror-backend.exe...'
    try {{ [System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192 }} catch {{}}
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($dlUrl, $exePath)
    Write-Output "[MAPT] Telechargement termine ($((Get-Item $exePath).Length) octets)."
}} else {{
    Write-Output '[MAPT] Binaire AppMirror deja present et a jour dans C:\\ProgramData\\MAPT\\appmirror.'
}}

# 3. Ecriture de config.json dans tous les profils utilisateurs + SystemProfile (UTF-8 sans BOM)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$targets = @()
Get-ChildItem 'C:\\Users' -Directory -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -notin @('Public','Default','Default User','All Users') }} | ForEach-Object {{
    $targets += Join-Path $_.FullName 'AppData\\Roaming\\appMirror\\config.json'
}}
$targets += 'C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\appMirror\\config.json'
foreach ($t in $targets) {{
    try {{
        $dir = Split-Path $t -Parent
        if (-not (Test-Path $dir)) {{ New-Item -ItemType Directory -Path $dir -Force | Out-Null }}
        [System.IO.File]::WriteAllText($t, $cfgJson, $utf8NoBom)
    }} catch {{}}
}}
Write-Output "[MAPT] Configuration ecrite (Utilisateur='{_ps_single_quote(web_username)}', Port=$port, BureauComplet={str(allow_full_desktop).lower()})."

# 4. Ouverture pare-feu Windows TCP $port
try {{
    & netsh advfirewall firewall delete rule name="MAPT AppMirror" | Out-Null
    & netsh advfirewall firewall add rule name="MAPT AppMirror" dir=in action=allow protocol=TCP localport=$port enable=yes | Out-Null
}} catch {{}}

# 5. Suppression de toute tache planifiee residuelle (execution uniquement a la demande, jamais au boot)
try {{ & schtasks.exe /Delete /TN "MAPT_AppMirror_OnDemand" /F 2>$null | Out-Null }} catch {{}}

# 6. Lancement dans la session interactive active (Session 1+) via WTSQueryUserToken / explorer token
$csharp = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class AppMirrorInteractiveLauncher {{
    [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("wtsapi32.dll", SetLastError=true)] static extern bool WTSQueryUserToken(uint SessionId, out IntPtr phToken);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool DuplicateTokenEx(IntPtr hExistingToken, uint dwDesiredAccess, IntPtr lpTokenAttributes, int ImpersonationLevel, int TokenType, out IntPtr phNewToken);
    [DllImport("userenv.dll", SetLastError=true)] static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);
    [DllImport("userenv.dll", SetLastError=true)] static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr hObject);
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern bool CreateProcessAsUserW(IntPtr hToken, string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct STARTUPINFO {{
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }}
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION {{ public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }}

    public static int Launch(string exePath, string args, bool hideWindow) {{
        IntPtr hToken = IntPtr.Zero;
        IntPtr hDup = IntPtr.Zero;
        IntPtr pEnv = IntPtr.Zero;
        try {{
            uint sessionId = WTSGetActiveConsoleSessionId();
            var explorers = Process.GetProcessesByName("explorer");
            if ((sessionId == 0xFFFFFFFF || sessionId == 0) && explorers.Length > 0) {{
                sessionId = (uint)explorers[0].SessionId;
            }}
            if (!WTSQueryUserToken(sessionId, out hToken)) {{
                foreach (var p in explorers) {{
                    IntPtr pTok;
                    if (OpenProcessToken(p.Handle, 0x0002 | 0x0008 | 0x0001, out pTok)) {{
                        hToken = pTok;
                        break;
                    }}
                }}
            }}
            if (hToken == IntPtr.Zero) return -1;
            if (!DuplicateTokenEx(hToken, 0x02000000, IntPtr.Zero, 2, 1, out hDup)) return -2;
            CreateEnvironmentBlock(out pEnv, hDup, false);

            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = "winsta0\\\\default";
            si.dwFlags = 0x00000001;
            si.wShowWindow = (short)(hideWindow ? 0 : 1);

            PROCESS_INFORMATION pi;
            string cmd = string.IsNullOrEmpty(args) ? "\\"" + exePath + "\\"" : "\\"" + exePath + "\\" " + args;
            uint flags = 0x00000400 | (hideWindow ? 0x08000000u : 0x00000010u);
            string workDir = System.IO.Path.GetDirectoryName(exePath);
            if (!CreateProcessAsUserW(hDup, null, cmd, IntPtr.Zero, IntPtr.Zero, false, flags, pEnv, workDir, ref si, out pi)) {{
                return -Marshal.GetLastWin32Error();
            }}
            int pid = pi.dwProcessId;
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return pid;
        }} finally {{
            if (pEnv != IntPtr.Zero) DestroyEnvironmentBlock(pEnv);
            if (hDup != IntPtr.Zero) CloseHandle(hDup);
            if (hToken != IntPtr.Zero) CloseHandle(hToken);
        }}
    }}
}}
"@

Add-Type -TypeDefinition $csharp -Language CSharp
$hideWin = ($modeArgs -eq '--headless')
$launchedPid = [AppMirrorInteractiveLauncher]::Launch($exePath, $modeArgs, $hideWin)
Write-Output "[MAPT] Resultat lancement interactif PID=$launchedPid"

if ($launchedPid -le 0) {{
    Write-Output '[MAPT] Aucune session utilisateur active ou erreur token -> repli via tache ephemere /IT...'
    $explorerProc = Get-Process -Name 'explorer' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($explorerProc) {{
        $taskCmd = if ($modeArgs) {{ "\\`"$exePath\\`" $modeArgs" }} else {{ "\\`"$exePath\\`"" }}
        & schtasks.exe /Create /F /TN "MAPT_AppMirror_OnDemand" /TR $taskCmd /SC ONCE /ST 00:00 /IT | Out-Null
        & schtasks.exe /Run /TN "MAPT_AppMirror_OnDemand" | Out-Null
        Start-Sleep -Seconds 2
        & schtasks.exe /Delete /TN "MAPT_AppMirror_OnDemand" /F 2>$null | Out-Null
    }} else {{
        $argList = if ($modeArgs) {{ @($modeArgs) }} else {{ @() }}
        Start-Process -FilePath $exePath -ArgumentList $argList -WorkingDirectory $baseDir -WindowStyle Hidden
    }}
}}

Start-Sleep -Seconds 1
$proc = Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) {{
    Write-Output "[MAPT] AppMirror actif avec succes (PID=$($proc.Id), Mode=$(if ($hideWin) {{'Headless'}} else {{'GUI'}}), Port=$port)."
    exit 0
}} else {{
    Write-Error '[MAPT] Echec: le processus appmirror-backend.exe ne s est pas maintenu apres le lancement.'
    exit 1
}}
"""
    encoded = _encode_ps_utf16(ps_script)
    return f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}"


def _build_stop_mirror_command() -> str:
    ps_script = """$ErrorActionPreference = 'Continue'
$procs = Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
try { & schtasks.exe /Delete /TN "MAPT_AppMirror_OnDemand" /F 2>$null | Out-Null } catch {}
$remaining = Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue
if ($remaining) {
    & taskkill.exe /F /IM appmirror-backend.exe /T 2>$null | Out-Null
    Start-Sleep -Milliseconds 300
}
Write-Output '[MAPT] Service AppMirror arrete avec succes.'
exit 0
"""
    encoded = _encode_ps_utf16(ps_script)
    return f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}"


@router.get("/{device_id}/mirror/status", response_model=MirrorStatusResponse)
async def get_mirror_status(
    device_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_device_permission(db, current_user, device_id)
    dev_service = DeviceService(db)
    device = await dev_service.get_device_by_id(device_id)

    cfg = await _load_mirror_config(device_id)
    port = int(cfg.get("port") or DEFAULT_MIRROR_PORT)
    running = await _probe_tcp_port(device.ip_address, port, timeout=1.2)

    dep_repo = DeploymentRepository(db)
    recent_targets = await dep_repo.get_targets_for_device(device_id, limit=25)
    last_mirror_action = None
    for t in recent_targets:
        dep_name = (t.deployment.name if t.deployment else "") or ""
        if "AppMirror" in dep_name:
            last_mirror_action = t
            break

    return MirrorStatusResponse(
        device_id=device.id,
        hostname=device.hostname,
        ip_address=device.ip_address,
        port=port,
        running=running,
        mode=cfg.get("mode"),
        web_username=cfg.get("web_username") or current_user.username,
        has_password=bool(cfg.get("web_password")),
        allow_full_desktop=cfg.get("allow_full_desktop", True),
        allow_virtual_desktop=cfg.get("allow_virtual_desktop", True),
        expose_all_apps=cfg.get("expose_all_apps", True),
        started_at=cfg.get("started_at"),
        last_action_id=last_mirror_action.id if last_mirror_action else None,
        last_action_name=last_mirror_action.deployment.name if (last_mirror_action and last_mirror_action.deployment) else None,
        last_action_status=last_mirror_action.status if last_mirror_action else None,
        last_action_error=last_mirror_action.error_message if last_mirror_action else None,
        last_action_created_at=last_mirror_action.created_at if last_mirror_action else None,
        direct_url=f"http://{device.ip_address}:{port}" if device.ip_address else None,
    )


@router.post("/{device_id}/mirror/start")
async def start_mirror_on_device(
    device_id: UUID,
    body: MirrorStartRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    await _check_device_permission(db, current_user, device_id)
    dev_service = DeviceService(db)
    device = await dev_service.get_device_by_id(device_id)

    if not device.is_online:
        logger.warning(f"Lancement AppMirror demandé sur {device.hostname} (hors-ligne détecté), la tâche reste en attente.")

    existing_cfg = await _load_mirror_config(device_id)
    web_username = (body.web_username or existing_cfg.get("web_username") or current_user.username).strip()

    if body.web_password and body.web_password.strip():
        web_password = body.web_password.strip()
        user_hash = getattr(current_user, "password_hash", None) or ""
        matches_mapt_password = verify_password(web_password, user_hash) if user_hash else False
    elif existing_cfg.get("web_password"):
        web_password = existing_cfg["web_password"]
        matches_mapt_password = bool(existing_cfg.get("matches_mapt_password", False))
    else:
        web_password = secrets.token_urlsafe(18)
        matches_mapt_password = False

    proto = request.headers.get("x-forwarded-proto", "http")
    host = request.headers.get("host", str(request.base_url.netloc) if request.base_url else "127.0.0.1")
    base_url = f"{proto}://{host}".rstrip("/")
    download_url = f"{base_url}{settings.API_V1_STR}/agent/download/appmirror"

    cmd = _build_start_mirror_command(
        download_url=download_url,
        mode=body.mode,
        port=body.port,
        web_username=web_username,
        web_password=web_password,
        pin=body.pin,
        allow_full_desktop=body.allow_full_desktop,
        allow_virtual_desktop=body.allow_virtual_desktop,
        expose_all_apps=body.expose_all_apps,
        force_reinstall=body.force_reinstall,
    )

    mode_label = "Headless" if body.mode == "headless" else "GUI"
    dep_in = DeploymentCreate(
        name=f"🖥️ Démarrer AppMirror ({mode_label}) - {device.hostname}",
        description=f"Exécution à la demande d'AppMirror Controller en mode {mode_label} (utilisateur web: {web_username})",
        deployment_type="command",
        custom_command=cmd,
        target_all_devices=False,
        target_device_ids=[device_id],
        target_group_ids=[],
        schedule_type="immediate",
        is_recurring=False,
    )
    dep_service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    deployment = await dep_service.create_deployment(dep_in, current_user, ip_address=client_ip)

    await _save_mirror_config(
        device_id,
        {
            "mode": body.mode,
            "port": body.port,
            "web_username": web_username,
            "web_password": web_password,
            "matches_mapt_password": matches_mapt_password,
            "pin": body.pin,
            "allow_full_desktop": body.allow_full_desktop,
            "allow_virtual_desktop": body.allow_virtual_desktop,
            "expose_all_apps": body.expose_all_apps,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "deployment_id": str(deployment.id),
        },
    )

    return {
        "status": "dispatched",
        "deployment_id": str(deployment.id),
        "mode": body.mode,
        "port": body.port,
        "web_username": web_username,
        "matches_mapt_password": matches_mapt_password,
        "message": f"Ordre de lancement AppMirror ({mode_label}) envoyé à {device.hostname}.",
    }


@router.post("/{device_id}/mirror/stop")
async def stop_mirror_on_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    await _check_device_permission(db, current_user, device_id)
    dev_service = DeviceService(db)
    device = await dev_service.get_device_by_id(device_id)

    cmd = _build_stop_mirror_command()
    dep_in = DeploymentCreate(
        name=f"🛑 Arrêter AppMirror - {device.hostname}",
        description="Arrêt du processus appmirror-backend.exe à distance",
        deployment_type="command",
        custom_command=cmd,
        target_all_devices=False,
        target_device_ids=[device_id],
        target_group_ids=[],
        schedule_type="immediate",
        is_recurring=False,
    )
    dep_service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    deployment = await dep_service.create_deployment(dep_in, current_user, ip_address=client_ip)

    cfg = await _load_mirror_config(device_id)
    if cfg:
        cfg["stopped_at"] = datetime.now(timezone.utc).isoformat()
        await _save_mirror_config(device_id, cfg)

    return {
        "status": "dispatched",
        "deployment_id": str(deployment.id),
        "message": f"Ordre d'arrêt AppMirror envoyé à {device.hostname}.",
    }


def _build_purge_mirror_command() -> str:
    ps_script = """$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$procs = Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
$remaining = Get-Process -Name 'appmirror-backend' -ErrorAction SilentlyContinue
if ($remaining) {
    & taskkill.exe /F /IM appmirror-backend.exe /T 2>$null | Out-Null
    Start-Sleep -Milliseconds 400
}
try { & schtasks.exe /Delete /TN "MAPT_AppMirror_OnDemand" /F >$null 2>$null } catch {}
$baseDir = 'C:\\ProgramData\\MAPT\\appmirror'
if (Test-Path $baseDir) {
    Remove-Item -Path $baseDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $baseDir) {
        Start-Sleep -Milliseconds 500
        Remove-Item -Path $baseDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Output '[MAPT] Dossier C:\\ProgramData\\MAPT\\appmirror supprime. Le binaire sera re-telecharge au prochain lancement.'
} else {
    Write-Output '[MAPT] Dossier C:\\ProgramData\\MAPT\\appmirror deja absent.'
}
exit 0
"""
    encoded = _encode_ps_utf16(ps_script)
    return f"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}"


@router.post("/{device_id}/mirror/purge")
async def purge_mirror_on_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.WRITE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    await _check_device_permission(db, current_user, device_id)
    dev_service = DeviceService(db)
    device = await dev_service.get_device_by_id(device_id)

    cmd = _build_purge_mirror_command()
    dep_in = DeploymentCreate(
        name=f"🧹 Purger client AppMirror - {device.hostname}",
        description="Arrêt d'AppMirror et suppression de C:\\ProgramData\\MAPT\\appmirror\\ pour forcer le re-téléchargement",
        deployment_type="command",
        custom_command=cmd,
        target_all_devices=False,
        target_device_ids=[device_id],
        target_group_ids=[],
        schedule_type="immediate",
        is_recurring=False,
    )
    dep_service = DeploymentService(db)
    client_ip = request.client.host if request.client else None
    deployment = await dep_service.create_deployment(dep_in, current_user, ip_address=client_ip)

    cfg = await _load_mirror_config(device_id)
    if cfg:
        cfg["stopped_at"] = datetime.now(timezone.utc).isoformat()
        await _save_mirror_config(device_id, cfg)

    return {
        "status": "dispatched",
        "deployment_id": str(deployment.id),
        "message": f"Ordre de suppression du client AppMirror (C:\\ProgramData\\MAPT\\appmirror\\) envoyé à {device.hostname}.",
    }


@router.websocket("/{device_id}/mirror/ws")
async def mirror_websocket_proxy(
    websocket: WebSocket,
    device_id: UUID,
    token: Optional[str] = Query(None),
):
    """
    Proxy WebSocket authentifié MAPT <-> appmirror-backend.exe sur la machine cible.
    Gère automatiquement la négociation d'authentification appMirror lorsque des identifiants sont connus.
    """
    if not token:
        await websocket.close(code=4401, reason="Jeton d'authentification MAPT manquant.")
        return

    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4401, reason="Jeton d'authentification MAPT invalide.")
        return

    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_id(UUID(payload["sub"]))
        if not user or not user.is_active:
            await websocket.close(code=4403, reason="Utilisateur inactif ou introuvable.")
            return

        if user.role == UserRole.OPERATOR:
            group_repo = GroupRepository(db)
            allowed_ids = await group_repo.get_operator_device_ids(user.id)
            if device_id not in allowed_ids:
                await websocket.close(code=4403, reason="Accès machine refusé.")
                return

        dev_service = DeviceService(db)
        try:
            device = await dev_service.get_device_by_id(device_id)
        except HTTPException:
            await websocket.close(code=4404, reason="Machine introuvable.")
            return

    target_ip = device.ip_address
    if not target_ip or target_ip.startswith("127.") or target_ip.startswith("172.18."):
        await websocket.close(code=4400, reason="Adresse IP de la machine cible indisponible.")
        return

    cfg = await _load_mirror_config(device_id)
    port = int(cfg.get("port") or DEFAULT_MIRROR_PORT)
    stored_username = cfg.get("web_username") or user.username
    stored_password = cfg.get("web_password") or ""

    await websocket.accept()
    target_ws_url = f"ws://{target_ip}:{port}/ws"

    try:
        async with websockets.connect(
            target_ws_url,
            max_size=25 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
            open_timeout=5,
        ) as upstream:

            manual_auth: dict = {}

            async def client_to_upstream():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if msg.get("text") is not None:
                            txt = msg["text"]
                            if '"authenticate"' in txt:
                                try:
                                    parsed = json.loads(txt)
                                    if parsed.get("type") == "authenticate" and parsed.get("password"):
                                        manual_auth["username"] = parsed.get("username") or stored_username
                                        manual_auth["password"] = parsed.get("password")
                                except Exception:
                                    pass
                            await upstream.send(txt)
                        elif msg.get("bytes") is not None:
                            await upstream.send(msg["bytes"])
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def upstream_to_client():
                auto_auth_attempted = False
                try:
                    async for msg in upstream:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            # Auto-authentification transparente si le poste cible la réclame
                            if not auto_auth_attempted and '"auth_required"' in msg:
                                try:
                                    parsed = json.loads(msg)
                                    if parsed.get("type") == "auth_required" and parsed.get("required") and stored_password:
                                        auto_auth_attempted = True
                                        await upstream.send(
                                            json.dumps(
                                                {
                                                    "type": "authenticate",
                                                    "username": stored_username,
                                                    "password": stored_password,
                                                }
                                            )
                                        )
                                        continue
                                except Exception:
                                    pass
                            if '"auth_result"' in msg:
                                try:
                                    parsed = json.loads(msg)
                                    if parsed.get("type") == "auth_result" and parsed.get("success"):
                                        if manual_auth.get("password"):
                                            updated_cfg = await _load_mirror_config(device_id)
                                            updated_cfg["web_username"] = manual_auth.get("username") or stored_username
                                            updated_cfg["web_password"] = manual_auth["password"]
                                            await _save_mirror_config(device_id, updated_cfg)
                                            manual_auth.clear()
                                        await upstream.send(json.dumps({"type": "list_windows"}))
                                except Exception:
                                    pass
                            await websocket.send_text(msg)
                except Exception:
                    pass

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(client_to_upstream()),
                    asyncio.create_task(upstream_to_client()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except Exception as e:
        logger.warning(f"Connexion proxy AppMirror vers {target_ws_url} impossible/interrompue: {e}")
        try:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"Impossible de joindre AppMirror sur {target_ip}:{port} ({e}). Vérifiez que le service AppMirror est bien démarré.",
                    }
                )
            )
            await websocket.close(code=1011, reason="AppMirror unreachable")
        except Exception:
            pass