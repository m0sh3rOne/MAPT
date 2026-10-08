import io
import os
import hashlib
from typing import Optional, List, Tuple
from uuid import UUID
from datetime import datetime, timezone
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_backup import UserProfileBackup, ProfileBackupStatus
from app.models.device import Device
from app.models.user import User
from app.models.deployment import Deployment, DeploymentTarget, DeploymentStatus, TargetStatus
from app.models.audit import AuditAction
from app.repositories.profile_backup_repository import ProfileBackupRepository
from app.repositories.device_repository import DeviceRepository
from app.repositories.deployment_repository import DeploymentRepository
from app.repositories.audit_repository import AuditRepository
from app.storage.minio import upload_file_bytes, get_file_stream, LOCAL_STORAGE_DIR
from app.core.config import settings


class ProfileBackupService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ProfileBackupRepository(db)
        self.device_repo = DeviceRepository(db)
        self.dep_repo = DeploymentRepository(db)
        self.audit_repo = AuditRepository(db)

    def _generate_backup_script(
        self,
        profile_name: str,
        backup_id: UUID,
        server_api_url: str,
        agent_token: str
    ) -> str:
        clean_profile = profile_name.replace('"', '`"')
        return f"""$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'

$ProfileName = "{clean_profile}"
$BackupId = "{str(backup_id)}"
$ServerApiUrl = "{server_api_url}".TrimEnd('/')
$AgentToken = "{agent_token}"

Write-Output "[*] Demarrage de la sauvegarde du profil '$ProfileName' (Backup ID: $BackupId)..."

$UserProfilesRoot = "C:\\Users"
$TargetFolder = Join-Path $UserProfilesRoot $ProfileName

if (-not (Test-Path $TargetFolder)) {{
    $MatchedFolder = Get-ChildItem -Path $UserProfilesRoot -Directory -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -eq $ProfileName -or $_.Name -like "*$ProfileName*" }} | Select-Object -First 1
    if ($MatchedFolder) {{
        $TargetFolder = $MatchedFolder.FullName
        Write-Output "[+] Dossier de profil trouve: $TargetFolder"
    }} else {{
        Write-Error "[-] Le dossier du profil '$ProfileName' est introuvable dans C:\\Users."
        exit 1
    }}
}}

$WorkDir = Join-Path $env:TEMP "MAPT_ProfileBackup_$BackupId"
if (Test-Path $WorkDir) {{ Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }}
$PackageDir = Join-Path $WorkDir "profile_data"
New-Item -Path $PackageDir -ItemType Directory -Force | Out-Null

$UserSid = $null
try {{
    $ProfileList = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList"
    Get-ChildItem -Path $ProfileList -ErrorAction SilentlyContinue | ForEach-Object {{
        $prop = Get-ItemProperty -Path $_.PSPath
        if ($prop.ProfileImagePath -and ($prop.ProfileImagePath -eq $TargetFolder -or (Split-Path $prop.ProfileImagePath -Leaf) -eq (Split-Path $TargetFolder -Leaf))) {{
            $UserSid = $_.PSChildName
        }}
    }}
}} catch {{
    Write-Output "[!] Note detection SID: $($_.Exception.Message)"
}}

Write-Output "[+] SID detecte: $(if ($UserSid) {{ $UserSid }} else {{ 'Non-specifie' }})"

Write-Output "[*] Copie des fichiers et donnees utilisateurs..."
$ExcludeDirs = @(
    "AppData\\Local\\Temp",
    "AppData\\Local\\Microsoft\\Windows\\INetCache",
    "AppData\\Local\\Microsoft\\Windows\\Explorer",
    "AppData\\Local\\CrashDumps",
    "AppData\\Local\\Package Cache",
    "AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache",
    "AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache"
)

$RoboLog = Join-Path $WorkDir "robocopy.log"
$RoboArgs = @(
    $TargetFolder,
    $PackageDir,
    "/E",
    "/R:1",
    "/W:1",
    "/NP",
    "/NFL",
    "/NDL",
    "/XJ",
    "/LOG:$RoboLog"
)
foreach ($x in $ExcludeDirs) {{
    $RoboArgs += "/XD"
    $RoboArgs += (Join-Path $TargetFolder $x)
}}

& robocopy.exe @RoboArgs
$RoboExit = $LASTEXITCODE
Write-Output "[+] Robocopy termine (code retour: $RoboExit)"

Write-Output "[*] Sauvegarde de la configuration du Registre..."
$DestNtUser = Join-Path $PackageDir "NTUSER.DAT"
$ExportedRegistry = $false

if ($UserSid) {{
    try {{
        if (Test-Path "Registry::HKEY_USERS\\$UserSid") {{
            Write-Output "[+] Profil charge en memoire, export direct..."
            & reg.exe save "HKU\\$UserSid" "$DestNtUser" /y | Out-Null
            if (Test-Path $DestNtUser) {{ $ExportedRegistry = $true }}
        }}
    }} catch {{}}
}}

if (-not $ExportedRegistry) {{
    $SourceNtUser = Join-Path $TargetFolder "NTUSER.DAT"
    if (Test-Path $SourceNtUser) {{
        try {{
            Copy-Item -Path $SourceNtUser -Destination $DestNtUser -Force -ErrorAction SilentlyContinue
            $ExportedRegistry = $true
        }} catch {{}}
    }}
}}

$Meta = @{{
    ProfileName = $ProfileName
    OriginalPath = $TargetFolder
    UserSid = $UserSid
    Hostname = $env:COMPUTERNAME
    OS = (Get-CimInstance Win32_OperatingSystem).Caption
    BackupDate = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Version = "1.0"
}}
$MetaJson = $Meta | ConvertTo-Json
Set-Content -Path (Join-Path $PackageDir "mapt_profile_meta.json") -Value $MetaJson -Encoding UTF8

$ZipPath = Join-Path $WorkDir "$ProfileName.zip"
Write-Output "[*] Compression de l'archive ($ZipPath)..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($PackageDir, $ZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$ZipSize = (Get-Item $ZipPath).Length
$ZipHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()
Write-Output "[+] Archive creee avec succes : $([math]::Round($ZipSize / 1MB, 2)) Mo (SHA256: $ZipHash)"

Write-Output "[*] Televersement de l'archive vers le serveur MAPT..."
$UploadUrl = "$ServerApiUrl/agent/profiles/$BackupId/upload"

$boundary = [System.Guid]::NewGuid().ToString()
$fileBytes = [System.IO.File]::ReadAllBytes($ZipPath)
$bodyStart = "--$boundary`r`nContent-Disposition: form-data; name=`"file`"; filename=`"$ProfileName.zip`"`r`nContent-Type: application/zip`r`n`r`n"
$bodyEnd = "`r`n--$boundary--`r`n"

$enc = [System.Text.Encoding]::GetEncoding("iso-8859-1")
$startBytes = $enc.GetBytes($bodyStart)
$endBytes = $enc.GetBytes($bodyEnd)

$allBytes = New-Object byte[] ($startBytes.Length + $fileBytes.Length + $endBytes.Length)
[System.Buffer]::BlockCopy($startBytes, 0, $allBytes, 0, $startBytes.Length)
[System.Buffer]::BlockCopy($fileBytes, 0, $allBytes, $startBytes.Length, $fileBytes.Length)
[System.Buffer]::BlockCopy($endBytes, 0, $allBytes, ($startBytes.Length + $fileBytes.Length), $endBytes.Length)

$headers = @{{
    "Authorization" = "Bearer $AgentToken"
    "X-Profile-SID" = if ($UserSid) {{ $UserSid }} else {{ "" }}
    "X-Profile-SHA256" = $ZipHash
    "X-Profile-Size" = "$ZipSize"
}}

$response = Invoke-RestMethod -Uri $UploadUrl -Method Post -Headers $headers -ContentType "multipart/form-data; boundary=$boundary" -Body $allBytes -TimeoutSec 1800

Write-Output "[+] Reponse serveur: OK"
Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[✓] Sauvegarde du profil '$ProfileName' terminee avec succes !"
exit 0
"""

    def _generate_restore_script(
        self,
        backup_id: UUID,
        target_username: str,
        create_account: bool,
        overwrite_existing: bool,
        server_api_url: str,
        agent_token: str
    ) -> str:
        clean_user = target_username.replace('"', '`"')
        create_acc_str = "$true" if create_account else "$false"
        return f"""$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'

$BackupId = "{str(backup_id)}"
$TargetUsername = "{clean_user}"
$CreateAccount = {create_acc_str}
$ServerApiUrl = "{server_api_url}".TrimEnd('/')
$AgentToken = "{agent_token}"

Write-Output "[*] Demarrage de la restauration du profil vers '$TargetUsername' (Backup ID: $BackupId)..."

$WorkDir = Join-Path $env:TEMP "MAPT_ProfileRestore_$BackupId"
if (Test-Path $WorkDir) {{ Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $WorkDir -ItemType Directory -Force | Out-Null
$ZipPath = Join-Path $WorkDir "profile.zip"

$DownloadUrl = "$ServerApiUrl/agent/profiles/$BackupId/download"
Write-Output "[*] Telechargement de l'archive du profil..."

$headers = @{{
    "Authorization" = "Bearer $AgentToken"
}}
Invoke-WebRequest -Uri $DownloadUrl -Headers $headers -OutFile $ZipPath -TimeoutSec 1800
Write-Output "[+] Archive telechargee ($([math]::Round((Get-Item $ZipPath).Length / 1MB, 2)) Mo)"

$AccountExists = $false
try {{
    $existing = Get-LocalUser -Name $TargetUsername -ErrorAction SilentlyContinue
    if ($existing) {{ $AccountExists = $true }}
}} catch {{}}

if (-not $AccountExists -and $CreateAccount) {{
    Write-Output "[*] Creation du compte utilisateur local '$TargetUsername'..."
    try {{
        & net.exe user "$TargetUsername" /add /expires:never
        & net.exe localgroup "Utilisateurs" "$TargetUsername" /add 2>$null
        Write-Output "[+] Compte local '$TargetUsername' cree."
    }} catch {{
        Write-Output "[!] Note creation compte: $($_.Exception.Message)"
    }}
}}

$DestProfilePath = "C:\\Users\\$TargetUsername"
if (-not (Test-Path $DestProfilePath)) {{
    New-Item -Path $DestProfilePath -ItemType Directory -Force | Out-Null
}}

Write-Output "[*] Decompression des donnees du profil vers $DestProfilePath..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestProfilePath)

Write-Output "[*] Configuration des permissions NTFS..."
& icacls.exe "$DestProfilePath" /grant "${{TargetUsername}}:(OI)(CI)F" /T /C /Q
& icacls.exe "$DestProfilePath" /grant "SYSTEM:(OI)(CI)F" /T /C /Q
& icacls.exe "$DestProfilePath" /grant "Administrateurs:(OI)(CI)F" /T /C /Q
& icacls.exe "$DestProfilePath" /setowner "$TargetUsername" /T /C /Q

try {{
    $objUser = New-Object System.Security.Principal.NTAccount($TargetUsername)
    $TargetSid = $objUser.Translate([System.Security.Principal.SecurityIdentifier]).Value
    
    if ($TargetSid) {{
        Write-Output "[+] SID resolu: $TargetSid"
        $ProfileKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$TargetSid"
        if (-not (Test-Path $ProfileKey)) {{
            New-Item -Path $ProfileKey -Force | Out-Null
        }}
        Set-ItemProperty -Path $ProfileKey -Name "ProfileImagePath" -Value $DestProfilePath -Type ExpandString
        Set-ItemProperty -Path $ProfileKey -Name "Flags" -Value 0 -Type DWord
        Set-ItemProperty -Path $ProfileKey -Name "State" -Value 0 -Type DWord
        Write-Output "[+] Profil enregistre dans la ProfileList Windows ($ProfileKey)"
    }}
}} catch {{
    Write-Output "[!] Note ProfileList: $($_.Exception.Message)"
}}

Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[✓] Migration du profil vers '$TargetUsername' terminee avec succes !"
exit 0
"""

    async def get_all_backups(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Tuple[List[UserProfileBackup], int]:
        return await self.repo.get_all(skip=skip, limit=limit, search=search, status=status)

    async def get_backup_by_id(self, backup_id: UUID) -> UserProfileBackup:
        backup = await self.repo.get_by_id(backup_id)
        if not backup:
            raise HTTPException(status_code=404, detail="Sauvegarde de profil introuvable.")
        return backup

    async def get_summary(self) -> dict:
        return await self.repo.get_summary()

    async def trigger_backup(
        self,
        device_id: UUID,
        profile_name: str,
        user: User,
        notes: Optional[str] = None,
        base_api_url: Optional[str] = None
    ) -> UserProfileBackup:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine source introuvable.")

        backup_id = UUID(int=int.from_bytes(os.urandom(16), "big"))
        storage_key = f"profiles/{backup_id}/{profile_name}.zip"

        backup = UserProfileBackup(
            id=backup_id,
            profile_name=profile_name,
            source_device_id=device.id,
            source_hostname=device.hostname,
            source_os=device.os_name,
            storage_key=storage_key,
            status=ProfileBackupStatus.BACKING_UP,
            notes=notes,
            created_by_user_id=user.id,
        )

        api_url = base_api_url or "http://localhost:8088/api/v1"
        agent_token = getattr(device, "agent_token", "mapt-agent-auth")

        script_content = self._generate_backup_script(
            profile_name=profile_name,
            backup_id=backup_id,
            server_api_url=api_url,
            agent_token=agent_token
        )

        deployment = Deployment(
            name=f"Sauvegarde Profil: {profile_name} sur {device.hostname}",
            description=f"Export et téléversement du profil Windows de l'utilisateur '{profile_name}'.",
            deployment_type="command",
            custom_command=script_content,
            created_by=user.id,
            status=DeploymentStatus.PENDING,
            target_all_devices=False,
            target_device_ids=[str(device.id)],
        )
        self.db.add(deployment)
        await self.db.flush()

        target = DeploymentTarget(
            deployment_id=deployment.id,
            device_id=device.id,
            status=TargetStatus.PENDING,
        )
        self.db.add(target)
        await self.db.flush()

        backup.backup_deployment_id = deployment.id
        await self.repo.create(backup)

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CREATED,
            user_id=user.id,
            username=user.username,
            details={
                "type": "profile_backup",
                "profile_name": profile_name,
                "device_id": str(device.id),
                "hostname": device.hostname,
                "backup_id": str(backup.id),
            }
        )

        return backup

    async def trigger_restore(
        self,
        backup_id: UUID,
        target_device_id: UUID,
        target_username: Optional[str],
        create_account: bool,
        overwrite_existing: bool,
        user: User,
        notes: Optional[str] = None,
        base_api_url: Optional[str] = None
    ) -> Deployment:
        backup = await self.get_backup_by_id(backup_id)
        if backup.status != ProfileBackupStatus.READY:
            raise HTTPException(
                status_code=400,
                detail=f"Impossible de restaurer ce profil car il est dans l'état '{backup.status}'."
            )

        target_device = await self.device_repo.get_by_id(target_device_id)
        if not target_device:
            raise HTTPException(status_code=404, detail="Machine cible introuvable.")

        effective_username = target_username.strip() if target_username and target_username.strip() else backup.profile_name
        api_url = base_api_url or "http://localhost:8088/api/v1"
        agent_token = getattr(target_device, "agent_token", "mapt-agent-auth")

        restore_script = self._generate_restore_script(
            backup_id=backup.id,
            target_username=effective_username,
            create_account=create_account,
            overwrite_existing=overwrite_existing,
            server_api_url=api_url,
            agent_token=agent_token
        )

        deployment = Deployment(
            name=f"Restauration Profil: {backup.profile_name} -> {effective_username} sur {target_device.hostname}",
            description=f"Migration et intégration du profil '{backup.profile_name}' vers le poste {target_device.hostname}.",
            deployment_type="command",
            custom_command=restore_script,
            created_by=user.id,
            status=DeploymentStatus.PENDING,
            target_all_devices=False,
            target_device_ids=[str(target_device.id)],
        )
        self.db.add(deployment)
        await self.db.flush()

        target = DeploymentTarget(
            deployment_id=deployment.id,
            device_id=target_device.id,
            status=TargetStatus.PENDING,
        )
        self.db.add(target)
        await self.db.flush()

        backup.last_restore_deployment_id = deployment.id
        await self.db.commit()

        await self.audit_repo.create(
            action=AuditAction.DEPLOYMENT_CREATED,
            user_id=user.id,
            username=user.username,
            details={
                "type": "profile_restore",
                "backup_id": str(backup.id),
                "profile_name": backup.profile_name,
                "target_device_id": str(target_device.id),
                "target_hostname": target_device.hostname,
                "target_username": effective_username,
            }
        )

        return deployment

    async def save_uploaded_backup(
        self,
        backup_id: UUID,
        file: UploadFile,
        user_sid: Optional[str],
        reported_sha256: Optional[str],
        reported_size: Optional[int]
    ) -> UserProfileBackup:
        backup = await self.get_backup_by_id(backup_id)

        content = await file.read()
        calculated_sha = hashlib.sha256(content).hexdigest()
        size_bytes = len(content)

        storage_key, sha256_hash, actual_size = upload_file_bytes(
            data=content,
            filename=f"{backup.profile_name}.zip",
            content_type="application/zip"
        )

        backup.storage_key = storage_key
        backup.sha256 = sha256_hash
        backup.size_bytes = actual_size
        backup.status = ProfileBackupStatus.READY
        if user_sid:
            backup.user_sid = user_sid

        await self.db.commit()
        await self.db.refresh(backup)
        return backup

    async def delete_backup(self, backup_id: UUID, user: User) -> bool:
        backup = await self.get_backup_by_id(backup_id)
        
        # Remove local file if present
        local_path = os.path.join(LOCAL_STORAGE_DIR, backup.storage_key)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass

        await self.audit_repo.create(
            action=AuditAction.DEVICE_DELETED,
            user_id=user.id,
            username=user.username,
            details={
                "type": "profile_deleted",
                "backup_id": str(backup.id),
                "profile_name": backup.profile_name,
                "source_hostname": backup.source_hostname,
            }
        )

        return await self.repo.delete(backup_id)
