import io
import os
import shutil
import hashlib
from typing import Optional, List, Tuple, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

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
        agent_token: str,
        compression_level: str = "optimal"
    ) -> str:
        clean_profile = profile_name.replace('"', '`"')
        return f"""$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'

$ProfileName = "{clean_profile}"
$BackupId = "{str(backup_id)}"
$ServerApiUrl = "{server_api_url}".TrimEnd('/')
$AgentToken = "{agent_token}"

Write-Output "[*] Initialisation de la sauvegarde du profil '$ProfileName' (Backup ID: $BackupId)..."

$UserProfilesRoot = "C:\\Users"
$TargetFolder = Join-Path $UserProfilesRoot $ProfileName

if (-not (Test-Path $TargetFolder)) {{
    $MatchedFolder = Get-ChildItem -Path $UserProfilesRoot -Directory -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -eq $ProfileName -or $_.Name -like "*$ProfileName*" }} | Select-Object -First 1
    if ($MatchedFolder) {{
        $TargetFolder = $MatchedFolder.FullName
        Write-Output "[+] Dossier de profil trouve : $TargetFolder"
    }} else {{
        Write-Error "[-] Le dossier du profil '$ProfileName' est introuvable dans C:\\Users."
        exit 1
    }}
}}

# 1. Estimation de la taille brute du profil
Write-Output "[*] Calcul et estimation de la taille du profil..."
$EstimatedSizeBytes = 0
try {{
    $Measure = Get-ChildItem -Path $TargetFolder -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    if ($Measure -and $Measure.Sum) {{
        $EstimatedSizeBytes = [long]$Measure.Sum
    }}
}} catch {{
    $EstimatedSizeBytes = 0
}}

$EstGB = [math]::Round($EstimatedSizeBytes / 1GB, 2)
$EstMB = [math]::Round($EstimatedSizeBytes / 1MB, 2)
Write-Output "[+] Taille brute estimee : $(if ($EstGB -ge 1) {{ "$EstGB Go" }} else {{ "$EstMB Mo" }}) ($EstimatedSizeBytes octets)"

# 2. Verification de l'espace de stockage disponible sur le serveur MAPT
Write-Output "[*] Verification de l'espace disponible sur le serveur MAPT..."
try {{
    $CheckUrl = "$ServerApiUrl/agent/profiles/storage-check?estimated_size=$EstimatedSizeBytes"
    $checkHeaders = @{{ "Authorization" = "Bearer $AgentToken" }}
    $checkResp = Invoke-RestMethod -Uri $CheckUrl -Method Get -Headers $checkHeaders -TimeoutSec 15
    $ServerFreeGB = [math]::Round($checkResp.server_free_bytes / 1GB, 2)
    Write-Output "[+] Serveur MAPT pret : $($checkResp.message) ($ServerFreeGB Go disponibles sur le serveur)"
}} catch {{
    Write-Output "[!] Note verification espace serveur : $($_.Exception.Message). Poursuite du processus..."
}}

# 3. Preparation de l'espace de travail temporaire local
$WorkDir = Join-Path $env:TEMP "MAPT_ProfileBackup_$BackupId"
if (Test-Path $WorkDir) {{ Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }}
$PackageDir = Join-Path $WorkDir "profile_data"
New-Item -Path $PackageDir -ItemType Directory -Force | Out-Null

# 4. Identification du SID Windows dans la Registry
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
    Write-Output "[!] Note detection SID : $($_.Exception.Message)"
}}

Write-Output "[+] SID utilisateur detecte : $(if ($UserSid) {{ $UserSid }} else {{ 'Non-specifie' }})"

# 5. Copie Robocopy avec exclusions de caches volumineux et temporaires
Write-Output "[*] Copie des fichiers et dossiers utilisateurs (Documents, Bureau, Images, AppData, etc.)..."
$ExcludeDirs = @(
    "Packages",
    "WindowsApps",
    "FeedSessions",
    "Temp",
    "INetCache",
    "WebCache",
    "CrashDumps",
    "Package Cache",
    "Cache",
    "cache2",
    "GPUCache",
    "Code Cache",
    "DawnCache",
    "ShaderCache",
    "GrShaderCache",
    "CacheStorage",
    "ScriptCache",
    "Service Worker"
)

$ExcludeFiles = @(
    "NTUSER.DAT.LOG*",
    "NTUSER.DAT{{*}}*",
    "*.tmp"
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
    "/LOG:$RoboLog",
    "/XD"
) + $ExcludeDirs + @("/XF") + $ExcludeFiles

& robocopy.exe @RoboArgs
$RoboExit = $LASTEXITCODE
if ($RoboExit -ge 16) {{
    Write-Output "[!] Attention : Robocopy a signale une anomalie fatale (Code $RoboExit)."
}} else {{
    Write-Output "[+] Copie des fichiers utilisateurs terminee avec succes (Code Robocopy : $RoboExit)"
}}

# 6. Sauvegarde propre et complete du registre utilisateur (NTUSER.DAT)
Write-Output "[*] Sauvegarde de la ruche de Registre (NTUSER.DAT)..."
$DestNtUser = Join-Path $PackageDir "NTUSER.DAT"
$ExportedRegistry = $false

if ($UserSid) {{
    try {{
        if (Test-Path "Registry::HKEY_USERS\\$UserSid") {{
            Write-Output "[+] Profil actif en memoire, export direct depuis HKU\\$UserSid..."
            & reg.exe save "HKU\\$UserSid" "$DestNtUser" /y 2>&1 | Out-Null
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

# Nettoyer les fichiers de transactions de registre résiduels pour éviter les locks corrompus
Get-ChildItem -Path $PackageDir -Filter "NTUSER.DAT.LOG*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $PackageDir -Filter "NTUSER.DAT{{*}}*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# 7. Creation du fichier de métadonnées
$Meta = @{{
    ProfileName = $ProfileName
    OriginalPath = $TargetFolder
    UserSid = $UserSid
    Hostname = $env:COMPUTERNAME
    OS = (Get-CimInstance Win32_OperatingSystem).Caption
    EstimatedSizeBytes = $EstimatedSizeBytes
    BackupDate = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Version = "2.0"
}}
$MetaJson = $Meta | ConvertTo-Json
Set-Content -Path (Join-Path $PackageDir "mapt_profile_meta.json") -Value $MetaJson -Encoding UTF8

# 8. Compression de l'archive ZIP
$ZipPath = Join-Path $WorkDir "$ProfileName.zip"
Write-Output "[*] Compression de l'archive ZIP..."
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Configuration du niveau de compression (.NET)
$CompLevel = [System.IO.Compression.CompressionLevel]::Optimal
if ("{compression_level}".ToLower() -in @("fastest", "faible", "fast")) {{
    $CompLevel = [System.IO.Compression.CompressionLevel]::Fastest
    Write-Output "[*] Taux de compression : Faible / Rapide (Fastest - gain CPU maximal)"
}} elseif ("{compression_level}".ToLower() -in @("maximum", "eleve", "high", "smallest")) {{
    try {{
        $CompLevel = [System.IO.Compression.CompressionLevel]::SmallestSize
        Write-Output "[*] Taux de compression : Eleve (SmallestSize - taille minimale)"
    }} catch {{
        $CompLevel = [System.IO.Compression.CompressionLevel]::Optimal
        Write-Output "[*] Taux de compression : Eleve / Optimal (Optimal)"
    }}
}} else {{
    Write-Output "[*] Taux de compression : Moyen / Equilibre (Optimal)"
}}

$ZipStream = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Create)
$ZipArchive = New-Object System.IO.Compression.ZipArchive($ZipStream, [System.IO.Compression.ZipArchiveMode]::Create)

$FilesToZip = Get-ChildItem -Path $PackageDir -Recurse -File -Force -ErrorAction SilentlyContinue
foreach ($f in $FilesToZip) {{
    $relPath = $f.FullName.Substring($PackageDir.Length + 1).Replace([char]92, [char]47)
    try {{
        $entry = $ZipArchive.CreateEntry($relPath, $CompLevel)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::Open($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $fileStream.CopyTo($entryStream)
        $fileStream.Close()
        $fileStream.Dispose()
        $entryStream.Close()
        $entryStream.Dispose()
    }} catch {{
        # Ignorer en toute securite les fichiers transitoires verrouilles par le systeme
    }}
}}

$ZipArchive.Dispose()
$ZipStream.Dispose()

$ZipSize = (Get-Item $ZipPath).Length
$ZipHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()
Write-Output "[+] Archive compresse avec succes : $([math]::Round($ZipSize / 1MB, 2)) Mo (SHA256: $ZipHash)"

# 9. Televersement de l'archive vers le serveur MAPT (Support des fichiers > 2 Go par flux)
Write-Output "[*] Televersement de l'archive vers le serveur MAPT ($([math]::Round($ZipSize / 1MB, 2)) Mo)..."
$UploadUrl = "$ServerApiUrl/agent/profiles/$BackupId/upload"

Add-Type -AssemblyName System.Net.Http

$httpClientHandler = New-Object System.Net.Http.HttpClientHandler
$httpClient = New-Object System.Net.Http.HttpClient($httpClientHandler)
$httpClient.Timeout = [System.TimeSpan]::FromHours(4)

$formContent = New-Object System.Net.Http.MultipartFormDataContent
$uploadFileStream = [System.IO.File]::OpenRead($ZipPath)
$streamContent = New-Object System.Net.Http.StreamContent($uploadFileStream)
$streamContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/zip")
$formContent.Add($streamContent, "file", "$ProfileName.zip")

$request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $UploadUrl)
$request.Headers.Add("Authorization", "Bearer $AgentToken")
$request.Headers.Add("X-Profile-SID", $(if ($UserSid) {{ $UserSid }} else {{ "" }}))
$request.Headers.Add("X-Profile-SHA256", $ZipHash)
$request.Headers.Add("X-Profile-Size", "$ZipSize")
$request.Headers.Add("X-Profile-Estimated-Size", "$EstimatedSizeBytes")
$request.Content = $formContent

try {{
    $responseTask = $httpClient.SendAsync($request)
    $responseTask.Wait()
    $httpResponse = $responseTask.Result

    if ($httpResponse.IsSuccessStatusCode) {{
        Write-Output "[+] Reponse serveur : Succes ($($httpResponse.StatusCode))"
    }} else {{
        $errBody = $httpResponse.Content.ReadAsStringAsync().Result
        Write-Error "[-] Echec televersement ($($httpResponse.StatusCode)): $errBody"
        exit 1
    }}
}} finally {{
    if ($uploadFileStream) {{ $uploadFileStream.Close(); $uploadFileStream.Dispose() }}
    if ($httpClient) {{ $httpClient.Dispose() }}
}}

Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[+] Sauvegarde du profil '$ProfileName' terminee avec succes !"
exit 0
"""

    def _generate_restore_script(
        self,
        backup_id: UUID,
        target_username: str,
        create_account: bool,
        overwrite_existing: bool,
        autologon: bool,
        autologon_password: Optional[str],
        server_api_url: str,
        agent_token: str,
        restore_mode: str = "simple"
    ) -> str:
        if restore_mode == "full_registry":
            return self._generate_restore_script_full(
                backup_id=backup_id,
                target_username=target_username,
                create_account=create_account,
                overwrite_existing=overwrite_existing,
                autologon=autologon,
                autologon_password=autologon_password,
                server_api_url=server_api_url,
                agent_token=agent_token
            )
        return self._generate_restore_script_simple(
            backup_id=backup_id,
            target_username=target_username,
            create_account=create_account,
            overwrite_existing=overwrite_existing,
            autologon=autologon,
            autologon_password=autologon_password,
            server_api_url=server_api_url,
            agent_token=agent_token
        )

    def _generate_restore_script_simple(
        self,
        backup_id: UUID,
        target_username: str,
        create_account: bool,
        overwrite_existing: bool,
        autologon: bool,
        autologon_password: Optional[str],
        server_api_url: str,
        agent_token: str
    ) -> str:
        clean_user = target_username.replace('"', '`"')
        create_acc_str = "$true" if create_account else "$false"
        autologon_str = "$true" if autologon else "$false"
        clean_pwd = (autologon_password or "").replace('"', '`"')

        return f"""$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'

$BackupId = "{str(backup_id)}"
$TargetUsername = "{clean_user}"
$CreateAccount = {create_acc_str}
$AutoLogon = {autologon_str}
$AutoLogonPassword = "{clean_pwd}"
$ServerApiUrl = "{server_api_url}".TrimEnd('/')
$AgentToken = "{agent_token}"

Write-Output "[*] Demarrage de la restauration standard (Mode Anti-corruption) vers '$TargetUsername' (Backup ID: $BackupId)..."

# 1. Verification / Creation du compte utilisateur local cible
$AccountExists = $false
try {{
    $existing = Get-LocalUser -Name $TargetUsername -ErrorAction SilentlyContinue
    if ($existing) {{ $AccountExists = $true }}
}} catch {{}}

if (-not $AccountExists -and $CreateAccount) {{
    Write-Output "[*] Creation du compte utilisateur local '$TargetUsername'..."
    $UserCreated = $false
    try {{
        if ($AutoLogonPassword) {{
            $secPass = ConvertTo-SecureString $AutoLogonPassword -AsPlainText -Force
            New-LocalUser -Name $TargetUsername -Password $secPass -Description "Compte migre par MAPT" -ErrorAction Stop | Out-Null
            Set-LocalUser -Name $TargetUsername -PasswordNeverExpires $true -UserMayNotChangePassword $false -ErrorAction SilentlyContinue
        }} else {{
            New-LocalUser -Name $TargetUsername -NoPassword -Description "Compte migre par MAPT" -ErrorAction Stop | Out-Null
            Set-LocalUser -Name $TargetUsername -PasswordNeverExpires $true -UserMayNotChangePassword $false -ErrorAction SilentlyContinue
        }}
        $UserCreated = $true
        Write-Output "[+] Compte local '$TargetUsername' cree via PowerShell LocalAccounts."
    }} catch {{
        Write-Output "[!] Fallback creation compte via net.exe : $($_.Exception.Message)"
        if ($AutoLogonPassword) {{
            cmd.exe /c "net.exe user `"$TargetUsername`" `"$AutoLogonPassword`" /add /expires:never /active:yes >nul 2>&1"
        }} else {{
            cmd.exe /c "net.exe user `"$TargetUsername`" /add /expires:never /active:yes >nul 2>&1"
        }}
        cmd.exe /c "wmic useraccount where name='$TargetUsername' set passwordexpires=false >nul 2>&1"
    }}

    try {{
        $usersGroup = Get-LocalGroup | Where-Object {{ $_.SID.Value -eq "S-1-5-32-545" }} | Select-Object -First 1
        if ($usersGroup) {{
            Add-LocalGroupMember -Group $usersGroup.Name -Member $TargetUsername -ErrorAction SilentlyContinue
        }}
    }} catch {{}}
    Write-Output "[+] Compte local '$TargetUsername' configure avec succes."
}}

# 2. Resolution du SID Windows de l'utilisateur cible
$TargetSid = $null
try {{
    $objUser = New-Object System.Security.Principal.NTAccount($TargetUsername)
    $TargetSid = $objUser.Translate([System.Security.Principal.SecurityIdentifier]).Value
    Write-Output "[+] SID resolu pour '$TargetUsername' : $TargetSid"
}} catch {{
    Write-Error "[-] Impossible de resoudre le SID pour '$TargetUsername'. Verifiez que le compte existe."
    exit 1
}}

# 3. Telechargement de l'archive du profil
$WorkDir = Join-Path $env:TEMP "MAPT_ProfileRestore_$BackupId"
if (Test-Path $WorkDir) {{ Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $WorkDir -ItemType Directory -Force | Out-Null
$ZipPath = Join-Path $WorkDir "profile.zip"

$DownloadUrl = "$ServerApiUrl/agent/profiles/$BackupId/download"
Write-Output "[*] Telechargement de l'archive du profil depuis le serveur MAPT..."

$headers = @{{
    "Authorization" = "Bearer $AgentToken"
}}
Invoke-WebRequest -Uri $DownloadUrl -Headers $headers -OutFile $ZipPath -TimeoutSec 7200
$DownloadedMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Output "[+] Archive telechargee avec succes ($DownloadedMB Mo)"

# 4. Provisionnement et verification du profil vierge natif pour '$TargetUsername'
$DestProfilePath = "C:\\Users\\$TargetUsername"
Write-Output "[*] Initialisation du profil utilisateur natif propre..."

$BakKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$TargetSid.bak"
if (Test-Path $BakKey) {{
    Remove-Item -Path $BakKey -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "[+] Clef orpheline ProfileList $TargetSid.bak supprimee."
}}

try {{
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace UserProfile {{
    public static class ProfileManager {{
        [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern int CreateProfile(
            [MarshalAs(UnmanagedType.LPWStr)] string pszUserSid,
            [MarshalAs(UnmanagedType.LPWStr)] string pszUserName,
            [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszProfilePath,
            uint cchProfilePath);
    }}
}}
'@ -ErrorAction SilentlyContinue

    $sb = New-Object System.Text.StringBuilder(260)
    $res = [UserProfile.ProfileManager]::CreateProfile($TargetSid, $TargetUsername, $sb, 260)
    if ($res -eq 0 -or $res -eq -2147024713) {{
        Write-Output "[+] Profil vierge officiel initialise par l'API Windows (userenv.dll)."
    }} else {{
        Write-Output "[!] Note CreateProfile (Code $res)."
    }}
}} catch {{
    Write-Output "[!] Note API CreateProfile : $($_.Exception.Message)"
}}

if (-not (Test-Path $DestProfilePath)) {{
    New-Item -Path $DestProfilePath -ItemType Directory -Force | Out-Null
}}

# Inscription et validation dans ProfileList
try {{
    $ProfileKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$TargetSid"
    if (-not (Test-Path $ProfileKey)) {{
        New-Item -Path $ProfileKey -Force | Out-Null
    }}
    Set-ItemProperty -Path $ProfileKey -Name "ProfileImagePath" -Value $DestProfilePath -Type ExpandString -Force
    Set-ItemProperty -Path $ProfileKey -Name "Flags" -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "State" -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "FullProfile" -Value 1 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "RefCount" -Value 0 -Type DWord -Force

    $targetSidObj = New-Object System.Security.Principal.SecurityIdentifier($TargetSid)
    $sidBinary = New-Object byte[] ($targetSidObj.BinaryLength)
    $targetSidObj.GetBinaryForm($sidBinary, 0)
    Set-ItemProperty -Path $ProfileKey -Name "Sid" -Value $sidBinary -Type Binary -Force
    Write-Output "[+] Entree ProfileList configuree et validee pour $TargetSid."
}} catch {{
    Write-Output "[!] Note ProfileList : $($_.Exception.Message)"
}}

# 5. Extraction de l'archive de sauvegarde dans un dossier temporaire
Write-Output "[*] Extraction des donnees de l'archive de sauvegarde..."
$ExtractDir = Join-Path $WorkDir "extracted"
if (Test-Path $ExtractDir) {{ Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $ExtractDir -ItemType Directory -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $ExtractDir)

# 6. FUSION DES FICHIERS ET DOSSIERS UTILISATEURS (SANS TOUCHER AU REGISTRE)
Write-Output "[*] Fusion des documents et donnees applicatives vers $DestProfilePath..."

$ExcludeFiles = @(
    "NTUSER.DAT*",
    "UsrClass.dat*",
    "*.blf",
    "*.regtrans-ms",
    "mapt_profile_meta.json",
    "*.tmp"
)

$ExcludeDirs = @(
    "Packages",
    "Protect",
    "GroupPolicy",
    "WebCache",
    "INetCache",
    "Temp",
    "CrashDumps",
    "Package Cache"
)

$RoboArgs = @(
    $ExtractDir,
    $DestProfilePath,
    "/E",
    "/R:1",
    "/W:1",
    "/NP",
    "/NFL",
    "/NDL",
    "/XJ"
) + @("/XF") + $ExcludeFiles + @("/XD") + $ExcludeDirs

& robocopy.exe @RoboArgs
Write-Output "[+] Fichiers et dossiers utilisateurs fusionnes avec succes (Bureau, Documents, AppData, etc.)."

# 7. Initialisation des dossiers systemes indispensables et AppData/Local/Packages (Windows 10/11 Shell)
Write-Output "[*] Initialisation de l'arborescence standard et AppData/Local/Packages..."
$packagesDir = [System.IO.Path]::Combine($DestProfilePath, "AppData", "Local", "Packages")
if (-not (Test-Path $packagesDir)) {{
    New-Item -Path $packagesDir -ItemType Directory -Force | Out-Null
    Write-Output "[+] Dossier AppData/Local/Packages initialise."
}}

$stdFolders = @("Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos", "AppData/Local", "AppData/Roaming")
foreach ($f in $stdFolders) {{
    $p = Join-Path $DestProfilePath $f
    if (-not (Test-Path $p)) {{ New-Item -Path $p -ItemType Directory -Force | Out-Null }}
}}

# Neutralisation du service AMD External Events Utility si present
$amdSvc = Get-Service -Name "AMD External Events Utility" -ErrorAction SilentlyContinue
if ($amdSvc) {{
    Stop-Service -Name "AMD External Events Utility" -Force -ErrorAction SilentlyContinue
    Set-Service -Name "AMD External Events Utility" -StartupType Disabled -ErrorAction SilentlyContinue
    Write-Output "[+] Service 'AMD External Events Utility' neutralise (evite le crash de session atieclxx.exe)."
}}

# 8. Reconfiguration complete des permissions NTFS, AppContainer et proprietaire
Write-Output "[*] Reconfiguration des permissions de securite NTFS sur $DestProfilePath..."
cmd.exe /c "attrib.exe -r -s -h `"$DestProfilePath\\*`" /s /d >nul 2>&1"
cmd.exe /c "echo Y | takeown.exe /F `"$DestProfilePath`" /R /A >nul 2>&1"
cmd.exe /c "echo O | takeown.exe /F `"$DestProfilePath`" /R /A >nul 2>&1"

$sidAclFull = "*$($TargetSid):(OI)(CI)F"
$userAclFull = "$($TargetUsername):(OI)(CI)F"

& icacls.exe "$DestProfilePath" /inheritance:e /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-18:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-32-544:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "$sidAclFull" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "$userAclFull" /T /C /Q 2>&1 | Out-Null

& icacls.exe "$DestProfilePath" /grant "*S-1-15-2-1:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-15-2-2:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-32-545:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-1:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-2:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "$sidAclFull" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /setowner "$TargetUsername" /T /C /Q 2>&1 | Out-Null

# S'assurer que NTUSER.DAT local dispose des permissions adequates sans modification interne
$DestNtUser = Join-Path $DestProfilePath "NTUSER.DAT"
if (-not (Test-Path $DestNtUser)) {{
    $DefaultNtUser = "C:\\Users\\Default\\NTUSER.DAT"
    if (Test-Path $DefaultNtUser) {{
        Copy-Item -Path $DefaultNtUser -Destination $DestNtUser -Force -ErrorAction SilentlyContinue
        Write-Output "[+] NTUSER.DAT vierge initialise depuis le profil par defaut local."
    }}
}}
if (Test-Path $DestNtUser) {{
    cmd.exe /c "attrib.exe -r -s -h `"$DestNtUser`" >nul 2>&1"
    & icacls.exe "$DestNtUser" /grant "*S-1-5-18:F" /grant "*S-1-5-32-544:F" /grant "*$($TargetSid):F" /grant "$($TargetUsername):F" /grant "*S-1-15-2-1:RX" /Q 2>&1 | Out-Null
    & icacls.exe "$DestNtUser" /setowner "$TargetUsername" /Q 2>&1 | Out-Null
    cmd.exe /c "attrib.exe +h +s `"$DestNtUser`" >nul 2>&1"
}}

# Nettoyer l'historique GPO sous HKU si la ruche etait precedemment montee
if (Test-Path "Registry::HKEY_USERS\\$TargetSid") {{
    Remove-Item -Path "Registry::HKEY_USERS\\$TargetSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\History" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "Registry::HKEY_USERS\\$TargetSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\Status" -Recurse -Force -ErrorAction SilentlyContinue
}}

# 9. Configuration de l'AutoLogon Windows (Ouverture automatique de session)
if ($AutoLogon) {{
    Write-Output "[*] Configuration de l'ouverture automatique de session (AutoLogon) pour '$TargetUsername'..."
    try {{
        $WinlogonKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"
        Set-ItemProperty -Path $WinlogonKey -Name "AutoAdminLogon" -Value "1" -Type String -Force
        Set-ItemProperty -Path $WinlogonKey -Name "DefaultUserName" -Value $TargetUsername -Type String -Force
        Set-ItemProperty -Path $WinlogonKey -Name "DefaultDomainName" -Value "." -Type String -Force
        if ($AutoLogonPassword) {{
            Set-ItemProperty -Path $WinlogonKey -Name "DefaultPassword" -Value $AutoLogonPassword -Type String -Force
        }} else {{
            Set-ItemProperty -Path $WinlogonKey -Name "DefaultPassword" -Value "" -Type String -Force
        }}
        Write-Output "[+] AutoLogon configure avec succes sur la session '$TargetUsername'."
    }} catch {{
        Write-Output "[!] Note AutoLogon : $($_.Exception.Message)"
    }}
}}

# 10. Nettoyage de l'espace temporaire
Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[+] Migration standard du profil vers '$TargetUsername' terminee avec succes !"
exit 0
"""

    def _generate_restore_script_full(
        self,
        backup_id: UUID,
        target_username: str,
        create_account: bool,
        overwrite_existing: bool,
        autologon: bool,
        autologon_password: Optional[str],
        server_api_url: str,
        agent_token: str
    ) -> str:
        clean_user = target_username.replace('"', '`"')
        create_acc_str = "$true" if create_account else "$false"
        autologon_str = "$true" if autologon else "$false"
        clean_pwd = (autologon_password or "").replace('"', '`"')

        return f"""$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'

$BackupId = "{str(backup_id)}"
$TargetUsername = "{clean_user}"
$CreateAccount = {create_acc_str}
$AutoLogon = {autologon_str}
$AutoLogonPassword = "{clean_pwd}"
$ServerApiUrl = "{server_api_url}".TrimEnd('/')
$AgentToken = "{agent_token}"

Write-Output "[*] Demarrage de la restauration complete avec reparation du registre (NTUSER.DAT) vers '$TargetUsername' (Backup ID: $BackupId)..."

# 1. Verification / Creation du compte utilisateur local cible
$AccountExists = $false
try {{
    $existing = Get-LocalUser -Name $TargetUsername -ErrorAction SilentlyContinue
    if ($existing) {{ $AccountExists = $true }}
}} catch {{}}

if (-not $AccountExists -and $CreateAccount) {{
    Write-Output "[*] Creation du compte utilisateur local '$TargetUsername'..."
    $UserCreated = $false
    try {{
        if ($AutoLogonPassword) {{
            $secPass = ConvertTo-SecureString $AutoLogonPassword -AsPlainText -Force
            New-LocalUser -Name $TargetUsername -Password $secPass -Description "Compte migre par MAPT" -ErrorAction Stop | Out-Null
            Set-LocalUser -Name $TargetUsername -PasswordNeverExpires $true -UserMayNotChangePassword $false -ErrorAction SilentlyContinue
        }} else {{
            New-LocalUser -Name $TargetUsername -NoPassword -Description "Compte migre par MAPT" -ErrorAction Stop | Out-Null
            Set-LocalUser -Name $TargetUsername -PasswordNeverExpires $true -UserMayNotChangePassword $false -ErrorAction SilentlyContinue
        }}
        $UserCreated = $true
        Write-Output "[+] Compte local '$TargetUsername' cree via PowerShell LocalAccounts."
    }} catch {{
        Write-Output "[!] Fallback creation compte via net.exe : $($_.Exception.Message)"
        if ($AutoLogonPassword) {{
            cmd.exe /c "net.exe user `"$TargetUsername`" `"$AutoLogonPassword`" /add /expires:never /active:yes >nul 2>&1"
        }} else {{
            cmd.exe /c "net.exe user `"$TargetUsername`" /add /expires:never /active:yes >nul 2>&1"
        }}
        cmd.exe /c "wmic useraccount where name='$TargetUsername' set passwordexpires=false >nul 2>&1"
    }}

    try {{
        $usersGroup = Get-LocalGroup | Where-Object {{ $_.SID.Value -eq "S-1-5-32-545" }} | Select-Object -First 1
        if ($usersGroup) {{
            Add-LocalGroupMember -Group $usersGroup.Name -Member $TargetUsername -ErrorAction SilentlyContinue
        }}
    }} catch {{}}
    Write-Output "[+] Compte local '$TargetUsername' configure avec succes."
}}

# 2. Resolution du SID Windows de l'utilisateur cible
$TargetSid = $null
try {{
    $objUser = New-Object System.Security.Principal.NTAccount($TargetUsername)
    $TargetSid = $objUser.Translate([System.Security.Principal.SecurityIdentifier]).Value
    Write-Output "[+] SID resolu pour '$TargetUsername' : $TargetSid"
}} catch {{
    Write-Error "[-] Impossible de resoudre le SID pour '$TargetUsername'. Verifiez que le compte existe."
    exit 1
}}

# 3. Telechargement de l'archive du profil
$WorkDir = Join-Path $env:TEMP "MAPT_ProfileRestore_$BackupId"
if (Test-Path $WorkDir) {{ Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $WorkDir -ItemType Directory -Force | Out-Null
$ZipPath = Join-Path $WorkDir "profile.zip"

$DownloadUrl = "$ServerApiUrl/agent/profiles/$BackupId/download"
Write-Output "[*] Telechargement de l'archive du profil depuis le serveur MAPT..."

$headers = @{{
    "Authorization" = "Bearer $AgentToken"
}}
Invoke-WebRequest -Uri $DownloadUrl -Headers $headers -OutFile $ZipPath -TimeoutSec 7200
$DownloadedMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Output "[+] Archive telechargee avec succes ($DownloadedMB Mo)"

# 4. Preparation du dossier de profil de destination
$DestProfilePath = "C:\\Users\\$TargetUsername"
if (-not (Test-Path $DestProfilePath)) {{
    New-Item -Path $DestProfilePath -ItemType Directory -Force | Out-Null
}}

# 5. Extraction et synchronisation complete (incluant NTUSER.DAT)
Write-Output "[*] Extraction des donnees de l'archive de sauvegarde..."
$ExtractDir = Join-Path $WorkDir "extracted"
if (Test-Path $ExtractDir) {{ Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $ExtractDir -ItemType Directory -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $ExtractDir)

Write-Output "[*] Copie integrale des donnees et du profil vers $DestProfilePath..."
$ExcludeFiles = @(
    "*.blf",
    "*.regtrans-ms",
    "mapt_profile_meta.json",
    "*.tmp"
)
$ExcludeDirs = @(
    "Packages",
    "GroupPolicy",
    "WebCache",
    "INetCache",
    "Temp",
    "CrashDumps",
    "Package Cache"
)
$RoboArgs = @(
    $ExtractDir,
    $DestProfilePath,
    "/E",
    "/R:1",
    "/W:1",
    "/NP",
    "/NFL",
    "/NDL",
    "/XJ"
) + @("/XF") + $ExcludeFiles + @("/XD") + $ExcludeDirs

& robocopy.exe @RoboArgs
Write-Output "[+] Donnees et fichiers de profil copies avec succes."

# 6. Neutralisation des services conflictuels residuels
$amdSvc = Get-Service -Name "AMD External Events Utility" -ErrorAction SilentlyContinue
if ($amdSvc) {{
    Stop-Service -Name "AMD External Events Utility" -Force -ErrorAction SilentlyContinue
    Set-Service -Name "AMD External Events Utility" -StartupType Disabled -ErrorAction SilentlyContinue
    Write-Output "[+] Service 'AMD External Events Utility' neutralise (evite le crash de session atieclxx.exe)."
}}

# 7. Nettoyage des journaux de transaction residuels
Write-Output "[*] Purge des fichiers de transaction de registre..."
cmd.exe /c "attrib.exe -h -s -r `"$DestProfilePath\\NTUSER.DAT.LOG*`" /s /d >nul 2>&1"
cmd.exe /c "attrib.exe -h -s -r `"$DestProfilePath\\NTUSER.DAT{{*`" /s /d >nul 2>&1"
cmd.exe /c "attrib.exe -h -s -r `"$DestProfilePath\\*.blf`" /s /d >nul 2>&1"
cmd.exe /c "attrib.exe -h -s -r `"$DestProfilePath\\*.regtrans-ms`" /s /d >nul 2>&1"

Get-ChildItem -Path $DestProfilePath -Filter "NTUSER.DAT.LOG*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "NTUSER.DAT{{*}}*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "*.blf" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "*.regtrans-ms" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# 8. Reinitialisation des cles DPAPI incompatibles
$protectDir = [System.IO.Path]::Combine($DestProfilePath, "AppData", "Roaming", "Microsoft", "Protect")
if (Test-Path $protectDir) {{
    $protectBak = "$protectDir.bak_" + (Get-Date -Format "yyyyMMddHHmmss")
    Rename-Item -Path $protectDir -NewName (Split-Path $protectBak -Leaf) -Force -ErrorAction SilentlyContinue
    Write-Output "[+] Cles DPAPI de l'ancienne machine neutralisees ($protectBak). Windows regenerera des cles locales."
}}

# 9. Neutralisation de UsrClass.dat etranger
$usrClassPath = [System.IO.Path]::Combine($DestProfilePath, "AppData", "Local", "Microsoft", "Windows", "UsrClass.dat")
if (Test-Path $usrClassPath) {{
    cmd.exe /c "attrib.exe -h -s -r `"$usrClassPath*`" >nul 2>&1"
    Rename-Item -Path $usrClassPath -NewName "UsrClass.dat.bak" -Force -ErrorAction SilentlyContinue
    Write-Output "[+] UsrClass.dat etranger renomme en UsrClass.dat.bak (evite le timeout DCOM 10010)."
}}

# 10. REPARATION ET ASSAINISSEMENT DE NTUSER.DAT (User Shell Folders + Permissions internes)
$DestNtUser = Join-Path $DestProfilePath "NTUSER.DAT"
if (Test-Path $DestNtUser) {{
    Write-Output "[*] Chargement et assainissement de la ruche NTUSER.DAT..."
    cmd.exe /c "attrib.exe -h -s -r `"$DestNtUser`" >nul 2>&1"
    cmd.exe /c "reg.exe unload HKLM\\MAPT_RestoreHive >nul 2>&1"
    & reg.exe load "HKLM\\MAPT_RestoreHive" "$DestNtUser" 2>$null

    $rootKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("MAPT_RestoreHive", $true)
    if ($rootKey) {{
        $usfSub = $rootKey.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", $true)
        if ($usfSub) {{
            $stdF = @{{
                "AppData"        = "%USERPROFILE%\\AppData\\Roaming"
                "Local AppData"  = "%USERPROFILE%\\AppData\\Local"
                "Desktop"        = "%USERPROFILE%\\Desktop"
                "Personal"       = "%USERPROFILE%\\Documents"
                "Favorites"      = "%USERPROFILE%\\Favorites"
                "My Music"       = "%USERPROFILE%\\Music"
                "My Pictures"    = "%USERPROFILE%\\Pictures"
                "My Video"       = "%USERPROFILE%\\Videos"
                "Programs"       = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs"
                "Start Menu"     = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu"
                "Startup"        = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
                "SendTo"         = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\SendTo"
                "Recent"         = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Recent"
                "Templates"      = "%USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Templates"
                "{{374DE290-123F-4565-9164-39C4925E467B}}" = "%USERPROFILE%\\Downloads"
                "{{7D83EE9B-2244-4E70-B1F5-5393042AF1E4}}" = "%USERPROFILE%\\Downloads"
            }}
            foreach ($k in $stdF.Keys) {{
                $usfSub.SetValue($k, $stdF[$k], [Microsoft.Win32.RegistryValueKind]::ExpandString)
            }}
            $usfSub.Close()
            Write-Output "[+] User Shell Folders realigne sur %USERPROFILE%."
        }}

        try {{ $rootKey.DeleteSubKeyTree("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders", $false) }} catch {{}}

        $envSub = $rootKey.OpenSubKey("Environment", $true)
        if ($envSub) {{
            $envSub.SetValue("TEMP", "%USERPROFILE%\\AppData\\Local\\Temp", [Microsoft.Win32.RegistryValueKind]::ExpandString)
            $envSub.SetValue("TMP", "%USERPROFILE%\\AppData\\Local\\Temp", [Microsoft.Win32.RegistryValueKind]::ExpandString)
            $envSub.Close()
        }}
        $rootKey.Close()

        Write-Output "[*] Reattribution des permissions internes de la ruche NTUSER.DAT pour '$TargetUsername'..."
        try {{
            $hiveAcl = Get-Acl "HKLM:\\MAPT_RestoreHive"
            $oldRules = $hiveAcl.Access | Where-Object {{ $_.IdentityReference.Value -like 'S-1-5-21-*' -and $_.IdentityReference.Value -ne $TargetSid }}
            foreach ($r in $oldRules) {{ $hiveAcl.RemoveAccessRule($r) | Out-Null }}

            $targetSidObj = New-Object System.Security.Principal.SecurityIdentifier($TargetSid)
            $systemSidObj = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
            $adminSidObj  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")

            $inherit = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
            $prop = [System.Security.AccessControl.PropagationFlags]::None
            $allow = [System.Security.AccessControl.AccessControlType]::Allow

            $hiveAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($targetSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
            $hiveAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($systemSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
            $hiveAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($adminSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
            Set-Acl -Path "HKLM:\\MAPT_RestoreHive" -AclObject $hiveAcl
            Write-Output "[+] Permissions internes NTUSER.DAT attribuees en FullControl a '$TargetUsername'."
        }} catch {{
            Write-Output "[!] Note Registry Hive ACL : $($_.Exception.Message)"
        }}
    }}

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    cmd.exe /c "reg.exe unload HKLM\\MAPT_RestoreHive >nul 2>&1"
}}

# 11. Initialisation des dossiers systemes indispensables et AppData/Local/Packages
Write-Output "[*] Verification des dossiers indispensables..."
$packagesDir = [System.IO.Path]::Combine($DestProfilePath, "AppData", "Local", "Packages")
if (-not (Test-Path $packagesDir)) {{
    New-Item -Path $packagesDir -ItemType Directory -Force | Out-Null
    Write-Output "[+] Dossier AppData/Local/Packages cree."
}}

$stdFolders = @("Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos", "AppData/Local", "AppData/Local/Temp", "AppData/Roaming")
foreach ($f in $stdFolders) {{
    $p = Join-Path $DestProfilePath $f
    if (-not (Test-Path $p)) {{ New-Item -Path $p -ItemType Directory -Force | Out-Null }}
}}

# 12. Reconfiguration complete des permissions NTFS, AppContainer et proprietaire
Write-Output "[*] Reapplication des permissions NTFS sur $DestProfilePath..."
cmd.exe /c "attrib.exe -r -s -h `"$DestProfilePath\\*`" /s /d >nul 2>&1"
cmd.exe /c "echo Y | takeown.exe /F `"$DestProfilePath`" /R /A >nul 2>&1"
cmd.exe /c "echo O | takeown.exe /F `"$DestProfilePath`" /R /A >nul 2>&1"

$sidAclFull = "*$($TargetSid):(OI)(CI)F"
$userAclFull = "$($TargetUsername):(OI)(CI)F"

& icacls.exe "$DestProfilePath" /inheritance:e /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-18:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-32-544:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "$sidAclFull" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "$userAclFull" /T /C /Q 2>&1 | Out-Null

& icacls.exe "$DestProfilePath" /grant "*S-1-15-2-1:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-15-2-2:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /grant "*S-1-5-32-545:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-1:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-2:(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "$sidAclFull" /T /C /Q 2>&1 | Out-Null
& icacls.exe "$DestProfilePath" /setowner "$TargetUsername" /T /C /Q 2>&1 | Out-Null

if (Test-Path $DestNtUser) {{
    cmd.exe /c "attrib.exe -r -s -h `"$DestNtUser`" >nul 2>&1"
    & icacls.exe "$DestNtUser" /grant "*S-1-5-18:F" /grant "*S-1-5-32-544:F" /grant "*$($TargetSid):F" /grant "$($TargetUsername):F" /grant "*S-1-15-2-1:RX" /Q 2>&1 | Out-Null
    & icacls.exe "$DestNtUser" /setowner "$TargetUsername" /Q 2>&1 | Out-Null
    cmd.exe /c "attrib.exe +h +s `"$DestNtUser`" >nul 2>&1"
}}

# 13. Inscription et activation du profil dans ProfileList
Write-Output "[*] Inscription et validation du profil dans ProfileList ($TargetSid)..."
try {{
    $BakKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$TargetSid.bak"
    if (Test-Path $BakKey) {{
        Remove-Item -Path $BakKey -Recurse -Force -ErrorAction SilentlyContinue
        Write-Output "[+] Clef corrompue ProfileList $TargetSid.bak supprimee."
    }}

    $ProfileKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$TargetSid"
    if (-not (Test-Path $ProfileKey)) {{
        New-Item -Path $ProfileKey -Force | Out-Null
    }}
    Set-ItemProperty -Path $ProfileKey -Name "ProfileImagePath" -Value $DestProfilePath -Type ExpandString -Force
    Set-ItemProperty -Path $ProfileKey -Name "Flags" -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "State" -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "FullProfile" -Value 1 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "RefCount" -Value 0 -Type DWord -Force

    $targetSidObj = New-Object System.Security.Principal.SecurityIdentifier($TargetSid)
    $sidBinary = New-Object byte[] ($targetSidObj.BinaryLength)
    $targetSidObj.GetBinaryForm($sidBinary, 0)
    Set-ItemProperty -Path $ProfileKey -Name "Sid" -Value $sidBinary -Type Binary -Force

    if (Test-Path "Registry::HKEY_USERS\\$TargetSid") {{
        Remove-Item -Path "Registry::HKEY_USERS\\$TargetSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\History" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "Registry::HKEY_USERS\\$TargetSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\Status" -Recurse -Force -ErrorAction SilentlyContinue
    }}

    Write-Output "[+] Profil valide et active dans ProfileList Windows ($ProfileKey)"
}} catch {{
    Write-Output "[!] Note ProfileList : $($_.Exception.Message)"
}}

# 14. Configuration de l'AutoLogon Windows
if ($AutoLogon) {{
    Write-Output "[*] Configuration de l'ouverture automatique de session (AutoLogon) pour '$TargetUsername'..."
    try {{
        $WinlogonKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"
        Set-ItemProperty -Path $WinlogonKey -Name "AutoAdminLogon" -Value "1" -Type String -Force
        Set-ItemProperty -Path $WinlogonKey -Name "DefaultUserName" -Value $TargetUsername -Type String -Force
        Set-ItemProperty -Path $WinlogonKey -Name "DefaultDomainName" -Value "." -Type String -Force
        if ($AutoLogonPassword) {{
            Set-ItemProperty -Path $WinlogonKey -Name "DefaultPassword" -Value $AutoLogonPassword -Type String -Force
        }} else {{
            Set-ItemProperty -Path $WinlogonKey -Name "DefaultPassword" -Value "" -Type String -Force
        }}
        Write-Output "[+] AutoLogon configure avec succes sur la session '$TargetUsername'."
    }} catch {{
        Write-Output "[!] Note AutoLogon : $($_.Exception.Message)"
    }}
}}

# 15. Nettoyage de l'espace temporaire
Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[+] Migration complete du profil (avec registre repare) vers '$TargetUsername' terminee avec succes !"
exit 0
"""

    def check_storage(self, estimated_size_bytes: int = 0) -> Dict[str, Any]:
        """
        Vérifie l'espace disque disponible sur le stockage local du serveur MAPT.
        Garantit une marge de sécurité de 2 Go minimum.
        """
        os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)
        total, used, free = shutil.disk_usage(LOCAL_STORAGE_DIR)
        safety_buffer = 2 * 1024 * 1024 * 1024  # 2 GB margin

        if estimated_size_bytes > 0:
            required = estimated_size_bytes + safety_buffer
            if free < required:
                free_gb = round(free / (1024**3), 2)
                req_gb = round(estimated_size_bytes / (1024**3), 2)
                raise HTTPException(
                    status_code=400,
                    detail=f"Espace disque insuffisant sur le serveur MAPT ({free_gb} Go libres, ~{req_gb} Go requis pour sauvegarder ce profil)."
                )

        return {
            "server_free_bytes": free,
            "server_total_bytes": total,
            "server_used_bytes": used,
            "message": f"Espace disque disponible : {round(free / (1024**3), 2)} Go libres sur {round(total / (1024**3), 2)} Go."
        }

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
        summary_data = await self.repo.get_summary()
        os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)
        total, used, free = shutil.disk_usage(LOCAL_STORAGE_DIR)
        summary_data["server_free_space_bytes"] = free
        summary_data["server_total_space_bytes"] = total
        return summary_data

    async def trigger_backup(
        self,
        device_id: UUID,
        profile_name: str,
        user: User,
        notes: Optional[str] = None,
        base_api_url: Optional[str] = None,
        compression_level: str = "optimal"
    ) -> UserProfileBackup:
        device = await self.device_repo.get_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Machine source introuvable.")

        # Vérifier l'espace disque du serveur à l'avance
        self.check_storage(estimated_size_bytes=0)

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

        api_url = base_api_url or "http://192.168.224.236/api/v1"
        agent_token = getattr(device, "agent_token", "mapt-agent-auth")

        script_content = self._generate_backup_script(
            profile_name=profile_name,
            backup_id=backup_id,
            server_api_url=api_url,
            agent_token=agent_token,
            compression_level=compression_level
        )

        deployment = Deployment(
            name=f"Sauvegarde Profil: {profile_name} sur {device.hostname}",
            description=f"Export et téléversement du profil Windows de l'utilisateur '{profile_name}'.",
            deployment_type="powershell",
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

        try:
            await self.audit_repo.create(
                action=AuditAction.DEPLOYMENT_CREATED,
                entity_type="user_profile_backup",
                user_id=user.id,
                entity_id=backup.id,
                details={
                    "type": "profile_backup",
                    "profile_name": profile_name,
                    "device_id": str(device.id),
                    "hostname": device.hostname,
                    "backup_id": str(backup.id),
                }
            )
        except Exception:
            pass

        return backup

    async def trigger_restore(
        self,
        backup_id: UUID,
        target_device_id: UUID,
        target_username: Optional[str],
        create_account: bool,
        overwrite_existing: bool,
        autologon: bool,
        autologon_password: Optional[str],
        user: User,
        notes: Optional[str] = None,
        base_api_url: Optional[str] = None,
        restore_mode: str = "simple"
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
        api_url = base_api_url or "http://192.168.224.236/api/v1"
        agent_token = getattr(target_device, "agent_token", "mapt-agent-auth")

        restore_script = self._generate_restore_script(
            backup_id=backup.id,
            target_username=effective_username,
            create_account=create_account,
            overwrite_existing=overwrite_existing,
            autologon=autologon,
            autologon_password=autologon_password,
            server_api_url=api_url,
            agent_token=agent_token,
            restore_mode=restore_mode
        )

        mode_label = "Complet (Registre réparé)" if restore_mode == "full_registry" else "Standard (Anti-corruption)"
        deployment = Deployment(
            name=f"Restauration Profil [{mode_label}]: {backup.profile_name} -> {effective_username} sur {target_device.hostname}",
            description=f"Migration et intégration du profil '{backup.profile_name}' ({mode_label}) vers le poste {target_device.hostname}.",
            deployment_type="powershell",
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

        try:
            await self.audit_repo.create(
                action=AuditAction.DEPLOYMENT_CREATED,
                entity_type="user_profile_restore",
                user_id=user.id,
                entity_id=backup.id,
                details={
                    "type": "profile_restore",
                    "backup_id": str(backup.id),
                    "profile_name": backup.profile_name,
                    "target_device_id": str(target_device.id),
                    "target_hostname": target_device.hostname,
                    "target_username": effective_username,
                    "restore_mode": restore_mode,
                }
            )
        except Exception:
            pass

        return deployment

    async def cancel_backup(self, backup_id: UUID, user: User) -> UserProfileBackup:
        backup = await self.get_backup_by_id(backup_id)
        if backup.backup_deployment_id:
            try:
                await self.dep_repo.cancel_deployment(backup.backup_deployment_id)
            except Exception:
                pass

        backup.status = ProfileBackupStatus.CANCELLED
        backup.error_message = "Sauvegarde annulée par l'administrateur."
        await self.db.commit()
        await self.db.refresh(backup)
        return backup

    async def save_uploaded_backup(
        self,
        backup_id: UUID,
        file: UploadFile,
        user_sid: Optional[str],
        reported_sha256: Optional[str],
        reported_size: Optional[int],
        estimated_size: Optional[int] = 0
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
        if estimated_size:
            backup.estimated_size_bytes = estimated_size
        backup.status = ProfileBackupStatus.READY
        backup.error_message = None
        if user_sid:
            backup.user_sid = user_sid

        await self.db.commit()
        await self.db.refresh(backup)
        return backup

    async def delete_backup(self, backup_id: UUID, user: User) -> bool:
        backup = await self.repo.get_by_id(backup_id)
        if not backup:
            return False

        # If backup has active deployment, cancel it
        if backup.backup_deployment_id:
            try:
                await self.dep_repo.cancel_deployment(backup.backup_deployment_id)
            except Exception:
                pass

        # Remove local file if present
        if backup.storage_key:
            local_path = os.path.join(LOCAL_STORAGE_DIR, backup.storage_key)
            if os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass

        try:
            await self.audit_repo.create(
                action=AuditAction.DEVICE_DELETED,
                entity_type="user_profile_backup",
                user_id=user.id,
                entity_id=backup.id,
                details={
                    "type": "profile_deleted",
                    "backup_id": str(backup.id),
                    "profile_name": backup.profile_name,
                    "source_hostname": backup.source_hostname,
                }
            )
        except Exception:
            pass

        return await self.repo.delete(backup_id)
