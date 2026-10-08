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
        agent_token: str
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
    $checkResp = Invoke-RestMethod -Uri $CheckUrl -Method Get -Headers $checkHeaders -TimeoutSec 30
    $ServerFreeGB = [math]::Round($checkResp.server_free_bytes / 1GB, 2)
    Write-Output "[+] Serveur MAPT pret : $($checkResp.message) ($ServerFreeGB Go disponibles sur le serveur)"
}} catch {{
    $errDetail = $_.Exception.Message
    try {{
        if ($_.Exception.Response) {{
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errDetail = $reader.ReadToEnd()
        }}
    }} catch {{}}
    Write-Error "[-] Espace serveur insuffisant ou verification impossible : $errDetail"
    exit 1
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
Write-Output "[*] Copie des fichiers et dossiers utilisateurs..."
$ExcludeDirs = @(
    "AppData\\Local\\Temp",
    "AppData\\Local\\Microsoft\\Windows\\INetCache",
    "AppData\\Local\\Microsoft\\Windows\\Explorer",
    "AppData\\Local\\Microsoft\\Windows\\WebCache",
    "AppData\\Local\\CrashDumps",
    "AppData\\Local\\Package Cache",
    "AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache",
    "AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache",
    "AppData\\Local\\Mozilla\\Firefox\\Profiles\\*\\cache2"
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
Write-Output "[+] Copie des fichiers terminee (Code retour Robocopy : $RoboExit)"

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
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($PackageDir, $ZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$ZipSize = (Get-Item $ZipPath).Length
$ZipHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()
Write-Output "[+] Archive compresse avec succes : $([math]::Round($ZipSize / 1MB, 2)) Mo (SHA256: $ZipHash)"

# 9. Televersement vers le serveur MAPT
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
    "X-Profile-Estimated-Size" = "$EstimatedSizeBytes"
}}

$response = Invoke-RestMethod -Uri $UploadUrl -Method Post -Headers $headers -ContentType "multipart/form-data; boundary=$boundary" -Body $allBytes -TimeoutSec 7200

Write-Output "[+] Reponse serveur : Succes ($($response.status))"
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

Write-Output "[*] Demarrage de la restauration du profil vers '$TargetUsername' (Backup ID: $BackupId)..."

# 1. Verification / Creation du compte utilisateur local cible
$AccountExists = $false
try {{
    $existing = Get-LocalUser -Name $TargetUsername -ErrorAction SilentlyContinue
    if ($existing) {{ $AccountExists = $true }}
}} catch {{}}

if (-not $AccountExists -and $CreateAccount) {{
    Write-Output "[*] Creation automatique du compte utilisateur local '$TargetUsername'..."
    if ($AutoLogonPassword) {{
        cmd.exe /c "net.exe user `"$TargetUsername`" `"$AutoLogonPassword`" /add /expires:never /active:yes >nul 2>&1"
    }} else {{
        cmd.exe /c "net.exe user `"$TargetUsername`" /add /expires:never /active:yes >nul 2>&1"
    }}
    cmd.exe /c "net.exe localgroup Utilisateurs `"$TargetUsername`" /add >nul 2>&1"
    cmd.exe /c "net.exe localgroup Users `"$TargetUsername`" /add >nul 2>&1"
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
# 4. Preparation du dossier de profil de destination
$DestProfilePath = "C:\\Users\\$TargetUsername"
if (-not (Test-Path $DestProfilePath)) {{
    New-Item -Path $DestProfilePath -ItemType Directory -Force | Out-Null
}} else {{
    # Decharger les ruches potentielles et reinitialiser les attributs de fichiers pour eviter tout verrou
    cmd.exe /c "reg.exe unload HKLM\\MAPT_RestoreHive >nul 2>&1"
    cmd.exe /c "reg.exe unload HKLM\\MAPT_RestoreUsrClass >nul 2>&1"
    cmd.exe /c "attrib.exe -r -s -h `"$DestProfilePath\\*`" /s /d >nul 2>&1"
    cmd.exe /c "takeown.exe /F `"$DestProfilePath`" /R /A /D O >nul 2>&1"
    cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-5-32-544:(OI)(CI)F /T /C /Q >nul 2>&1"
    cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-5-18:(OI)(CI)F /T /C /Q >nul 2>&1"
}}

# 5. Extraction securisee vers repertoire temporaire puis synchronisation robuste
Write-Output "[*] Extraction des donnees du profil..."
$ExtractDir = Join-Path $WorkDir "extracted"
if (Test-Path $ExtractDir) {{ Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue }}
New-Item -Path $ExtractDir -ItemType Directory -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $ExtractDir)

Write-Output "[*] Copie et integration des fichiers vers $DestProfilePath..."
cmd.exe /c "robocopy.exe `"$ExtractDir`" `"$DestProfilePath`" /E /R:1 /W:1 /NP /NFL /NDL /XJ >nul 2>&1"
Write-Output "[+] Fichiers integres avec succes."

# 6. Purge des fichiers de transaction et cache GPO corrompus de l'ancienne machine
Write-Output "[*] Nettoyage des caches et logs de transactions de registre..."
Get-ChildItem -Path $DestProfilePath -Filter "NTUSER.DAT.LOG*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "NTUSER.DAT{{*}}*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "UsrClass.dat.LOG*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "UsrClass.dat{{*}}*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "*.blf" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $DestProfilePath -Filter "*.regtrans-ms" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Supprimer le cache local GroupPolicy et WebCache pour forcer gpsvc a regenerer un etat propre sans conflit
$StaleDirs = @(
    "AppData\\Local\\GroupPolicy",
    "AppData\\Local\\Microsoft\\Windows\\WebCache",
    "AppData\\Local\\Microsoft\\Windows\\INetCache"
)
foreach ($dir in $StaleDirs) {{
    $fullP = Join-Path $DestProfilePath $dir
    if (Test-Path $fullP) {{ Remove-Item -Path $fullP -Recurse -Force -ErrorAction SilentlyContinue }}
}}

# 7. FONCTION DE RECONFIGURATION DES PERMISSIONS DU REGISTRE (NTUSER.DAT & UsrClass.dat)
function Fix-RegistryHiveAcls {{
    param(
        [string]$HiveFilePath,
        [string]$TempKeyName,
        [string]$UserSid
    )
    if (-not (Test-Path $HiveFilePath)) {{ return }}
    
    cmd.exe /c "reg.exe unload HKLM\\$TempKeyName >nul 2>&1"
    Set-ItemProperty -Path $HiveFilePath -Name Attributes -Value "Archive" -Force -ErrorAction SilentlyContinue
    cmd.exe /c "reg.exe load HKLM\\$TempKeyName `"$HiveFilePath`" >nul 2>&1"

    if (Test-Path "Registry::HKEY_LOCAL_MACHINE\\$TempKeyName") {{
        try {{
            $hiveKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
                $TempKeyName,
                [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,
                [System.Security.AccessControl.RegistryRights]::ChangePermissions -bor [System.Security.AccessControl.RegistryRights]::TakeOwnership -bor [System.Security.AccessControl.RegistryRights]::FullControl
            )
            if ($hiveKey) {{
                $regAcl = $hiveKey.GetAccessControl()
                
                $targetSidObj = New-Object System.Security.Principal.SecurityIdentifier($UserSid)
                $systemSidObj = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
                $adminSidObj  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
                $appPkgSidObj = New-Object System.Security.Principal.SecurityIdentifier("S-1-15-2-1")
                $restrPkgObj  = New-Object System.Security.Principal.SecurityIdentifier("S-1-15-2-2")
                $usersSidObj  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-545")
                $restrSidObj  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-12")

                $regAcl.SetOwner($targetSidObj)

                $inherit = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
                $prop = [System.Security.AccessControl.PropagationFlags]::None
                $allow = [System.Security.AccessControl.AccessControlType]::Allow

                $regAcl.ResetAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($systemSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($adminSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($targetSidObj, [System.Security.AccessControl.RegistryRights]::FullControl, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($appPkgSidObj, [System.Security.AccessControl.RegistryRights]::ReadKey, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($restrPkgObj, [System.Security.AccessControl.RegistryRights]::ReadKey, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($usersSidObj, [System.Security.AccessControl.RegistryRights]::ReadKey, $inherit, $prop, $allow)))
                $regAcl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($restrSidObj, [System.Security.AccessControl.RegistryRights]::ReadKey, $inherit, $prop, $allow)))

                $hiveKey.SetAccessControl($regAcl)
                $hiveKey.Close()

                # Re-appliquer explicitement sur les sous-cles critiques gpsvc
                $critSubKeys = @(
                    "HKEY_LOCAL_MACHINE\\$TempKeyName\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy",
                    "HKEY_LOCAL_MACHINE\\$TempKeyName\\Software\\Policies",
                    "HKEY_LOCAL_MACHINE\\$TempKeyName\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies"
                )
                foreach ($skPath in $critSubKeys) {{
                    if (Test-Path "Registry::$skPath") {{
                        try {{
                            $cleanSub = $skPath.Replace("HKEY_LOCAL_MACHINE\\", "")
                            $sk = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
                                $cleanSub,
                                [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,
                                [System.Security.AccessControl.RegistryRights]::ChangePermissions -bor [System.Security.AccessControl.RegistryRights]::FullControl
                            )
                            if ($sk) {{
                                $sk.SetAccessControl($regAcl)
                                $sk.Close()
                            }}
                        }} catch {{}}
                    }}
                }}
            }}
        }} catch {{
            Write-Output "[!] Note Registry ACL ($TempKeyName) : $($_.Exception.Message)"
        }} finally {{
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
            Start-Sleep -Milliseconds 300
            cmd.exe /c "reg.exe unload HKLM\\$TempKeyName >nul 2>&1"
        }}
    }}
    Set-ItemProperty -Path $HiveFilePath -Name Attributes -Value "Hidden,System,Archive" -Force -ErrorAction SilentlyContinue
}}

# Traitement NTUSER.DAT
$DestNtUser = Join-Path $DestProfilePath "NTUSER.DAT"
if (Test-Path $DestNtUser) {{
    Write-Output "[*] Reattribution des permissions internes NTUSER.DAT..."
    Fix-RegistryHiveAcls -HiveFilePath $DestNtUser -TempKeyName "MAPT_RestoreHive" -UserSid $TargetSid
    Write-Output "[+] Permissions NTUSER.DAT configurees avec succes."
}}

# Traitement UsrClass.dat
$DestUsrClass = Join-Path $DestProfilePath "AppData\\Local\\Microsoft\\Windows\\UsrClass.dat"
if (Test-Path $DestUsrClass) {{
    Write-Output "[*] Reattribution des permissions internes UsrClass.dat..."
    Fix-RegistryHiveAcls -HiveFilePath $DestUsrClass -TempKeyName "MAPT_RestoreUsrClass" -UserSid $TargetSid
    Write-Output "[+] Permissions UsrClass.dat configurees avec succes."
}}

# 8. Reconfiguration complete des permissions de securite NTFS et proprietaire
Write-Output "[*] Reconfiguration des permissions de securite NTFS sur $DestProfilePath..."
cmd.exe /c "takeown.exe /F `"$DestProfilePath`" /R /A /D O >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /inheritance:e /T /C /Q >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-5-18:(OI)(CI)F /T /C /Q >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-5-32-544:(OI)(CI)F /T /C /Q >nul 2>&1"

$GrantSidArg = "*$($TargetSid)" + ':(OI)(CI)F'
$GrantUserArg = "$($TargetUsername)" + ':(OI)(CI)F'
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant `"$GrantSidArg`" /T /C /Q >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant `"$GrantUserArg`" /T /C /Q >nul 2>&1"

# Permissions requises pour les packages d'applications Windows (AppX / Shell / gpsvc)
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-15-2-1:(OI)(CI)RX /T /C /Q >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /grant *S-1-15-2-2:(OI)(CI)RX /T /C /Q >nul 2>&1"
cmd.exe /c "icacls.exe `"$DestProfilePath`" /setowner `"$TargetUsername`" /T /C /Q >nul 2>&1"

# 9. Inscription et activation du profil dans HKLM ProfileList
Write-Output "[*] Inscription du profil dans le registre Windows ProfileList ($TargetSid)..."
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
    Set-ItemProperty -Path $ProfileKey -Name "ProfileLoadTimeLow" -Value 0 -Type DWord -Force
    Set-ItemProperty -Path $ProfileKey -Name "ProfileLoadTimeHigh" -Value 0 -Type DWord -Force
    Write-Output "[+] Profil active dans ProfileList Windows ($ProfileKey)"
}} catch {{
    Write-Output "[!] Note ProfileList : $($_.Exception.Message)"
}}

# 10. Configuration de l'AutoLogon Windows (Ouverture automatique de session)
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

# 11. Nettoyage de l'espace temporaire
Remove-Item -Path $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "[✓] Migration et integration du profil vers '$TargetUsername' terminee avec succes !"
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
        base_api_url: Optional[str] = None
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
            autologon=autologon,
            autologon_password=autologon_password,
            server_api_url=api_url,
            agent_token=agent_token
        )

        deployment = Deployment(
            name=f"Restauration Profil: {backup.profile_name} -> {effective_username} sur {target_device.hostname}",
            description=f"Migration et intégration du profil '{backup.profile_name}' vers le poste {target_device.hostname}.",
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
