import hashlib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import logger
from app.models.user import User
from app.models.script import Script, ScriptVersion

REPAIR_PROFILE_SCRIPT_CONTENT = r"""<#
.SYNOPSIS
    Script universel de réparation d'un profil utilisateur Windows restauré/migré depuis un autre poste.
    Résout les rejets à la connexion ("Déconnexion immédiate", "Échec de l'ouverture de session", crash de session).

.DESCRIPTION
    Ce script effectue les actions correctives indispensables après une restauration de profil :
    1. Neutralisation des services conflictuels résiduels (AMD External Events / atieclxx.exe).
    2. Purge des journaux de transaction résiduels (.LOG, .blf, .regtrans-ms).
    3. Réinitialisation des clés DPAPI incompatibles (Microsoft\\Protect).
    4. Neutralisation de UsrClass.dat étranger (reconstruction automatique par Windows pour éviter DCOM 10010).
    5. Correction de User Shell Folders dans NTUSER.DAT (suppression du chemin corrompu systemprofile).
    6. Création des dossiers système et conteneurs AppX (AppData\\Local\\Packages).
    7. Réapplication stricte des ACLs NTFS (Propriétaire, SYSTEM, Administrateurs, TOUS LES PACKAGES D'APPLICATION).
    8. Inscription propre dans ProfileList avec SID binaire et FullProfile=1.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$TargetUsername = ""
)

# Vérification des privilèges Administrateur
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "[-] Ce script doit impérativement être exécuté en tant qu'Administrateur."
    exit 1
}

# Auto-détection du compte cible si non spécifié
if (-not $TargetUsername) {
    $nonSystem = @("Default", "Default User", "All Users", "Public", "Admin", "Administrateur")
    $candidates = Get-ChildItem "C:\Users" -Directory | Where-Object { $_.Name -notin $nonSystem } | Sort-Object LastWriteTime -Descending
    if ($candidates) {
        $TargetUsername = $candidates[0].Name
        Write-Host "[*] Aucun utilisateur spécifié, détection automatique du profil le plus récent : '$TargetUsername'" -ForegroundColor Yellow
    } else {
        Write-Error "[-] Aucun utilisateur cible spécifié et impossible de le déterminer automatiquement."
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   RÉPARATION DU PROFIL UTILISATEUR : $TargetUsername" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Résolution de l'utilisateur et du dossier
try {
    $localUser = Get-LocalUser -Name $TargetUsername -ErrorAction Stop
    $userSid = $localUser.SID.Value
    Write-Host "[+] Compte local trouvé : $TargetUsername (SID: $userSid)" -ForegroundColor Green
} catch {
    Write-Error "[-] Utilisateur local '$TargetUsername' introuvable."
    exit 1
}

$profPath = "C:\\Users\\$TargetUsername"
if (-not (Test-Path $profPath)) {
    Write-Error "[-] Le dossier de profil '$profPath' n'existe pas."
    exit 1
}

# 2. Désactivation des services à l'origine de crashs de session
Write-Host "`n[*] [1/8] Neutralisation des services résiduels conflictuels..." -ForegroundColor Yellow
$amdSvc = Get-Service -Name "AMD External Events Utility" -ErrorAction SilentlyContinue
if ($amdSvc) {
    Stop-Service -Name "AMD External Events Utility" -Force -ErrorAction SilentlyContinue
    Set-Service -Name "AMD External Events Utility" -StartupType Disabled -ErrorAction SilentlyContinue
    Write-Host "  -> Service 'AMD External Events Utility' désactivé (élimine le crash atieclxx.exe)." -ForegroundColor Green
}

# 3. Nettoyage des journaux de transactions résiduels
Write-Host "`n[*] [2/8] Purge des fichiers de transaction de registre résiduels..." -ForegroundColor Yellow
cmd.exe /c "attrib -h -s -r `"$profPath\\NTUSER.DAT.LOG*`" /s /d >nul 2>&1"
cmd.exe /c "attrib -h -s -r `"$profPath\\NTUSER.DAT{*`" /s /d >nul 2>&1"
cmd.exe /c "attrib -h -s -r `"$profPath\\*.blf`" /s /d >nul 2>&1"
cmd.exe /c "attrib -h -s -r `"$profPath\\*.regtrans-ms`" /s /d >nul 2>&1"

Get-ChildItem -Path $profPath -Filter "NTUSER.DAT.LOG*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $profPath -Filter "NTUSER.DAT{*}*" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $profPath -Filter "*.blf" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $profPath -Filter "*.regtrans-ms" -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "  -> Journaux de transactions NTUSER.DAT purgés." -ForegroundColor Green

# 4. Réinitialisation des clés DPAPI d'une autre machine
Write-Host "`n[*] [3/8] Réinitialisation des clés DPAPI incompatibles..." -ForegroundColor Yellow
$protectDir = "$profPath\\AppData\\Roaming\\Microsoft\\Protect"
if (Test-Path $protectDir) {
    $protectBak = "$profPath\\AppData\\Roaming\\Microsoft\\Protect.bak_" + (Get-Date -Format "yyyyMMddHHmmss")
    Rename-Item -Path $protectDir -NewName (Split-Path $protectBak -Leaf) -Force -ErrorAction SilentlyContinue
    Write-Host "  -> Clés DPAPI renommées en $protectBak (Windows régénérera des clés locales)." -ForegroundColor Green
}

# 5. Neutralisation de UsrClass.dat étranger
Write-Host "`n[*] [4/8] Neutralisation de la ruche UsrClass.dat étrangère..." -ForegroundColor Yellow
$usrClassPath = "$profPath\\AppData\\Local\\Microsoft\\Windows\\UsrClass.dat"
if (Test-Path $usrClassPath) {
    cmd.exe /c "attrib -h -s -r `"$usrClassPath*`" >nul 2>&1"
    Rename-Item -Path $usrClassPath -NewName "UsrClass.dat.bak" -Force -ErrorAction SilentlyContinue
    Write-Host "  -> UsrClass.dat étranger renommé en UsrClass.dat.bak (évite DCOM timeout 10010)." -ForegroundColor Green
}

# 6. Correction de User Shell Folders dans NTUSER.DAT (purge du pointage systemprofile)
Write-Host "`n[*] [5/8] Assainissement de User Shell Folders dans NTUSER.DAT..." -ForegroundColor Yellow
$hiveFile = "$profPath\\NTUSER.DAT"
if (Test-Path $hiveFile) {
    cmd.exe /c "reg.exe unload HKLM\\MAPT_FixHive >nul 2>&1"
    & reg.exe load "HKLM\\MAPT_FixHive" "$hiveFile" 2>$null
    
    $rootKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("MAPT_FixHive", $true)
    if ($rootKey) {
        $usfSub = $rootKey.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", $true)
        if ($usfSub) {
            $stdF = @{
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
                "{374DE290-123F-4565-9164-39C4925E467B}" = "%USERPROFILE%\\Downloads"
                "{7D83EE9B-2244-4E70-B1F5-5393042AF1E4}" = "%USERPROFILE%\\Downloads"
            }
            foreach ($k in $stdF.Keys) {
                $usfSub.SetValue($k, $stdF[$k], [Microsoft.Win32.RegistryValueKind]::ExpandString)
            }
            $usfSub.Close()
            Write-Host "  -> User Shell Folders réaligné sur %USERPROFILE%." -ForegroundColor Green
        }
        
        # Supprimer le cache statique Shell Folders
        try { $rootKey.DeleteSubKeyTree("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders", $false) } catch {}

        # Réaligner les variables d'environnement TEMP / TMP
        $envSub = $rootKey.OpenSubKey("Environment", $true)
        if ($envSub) {
            $envSub.SetValue("TEMP", "%USERPROFILE%\\AppData\\Local\\Temp", [Microsoft.Win32.RegistryValueKind]::ExpandString)
            $envSub.SetValue("TMP", "%USERPROFILE%\\AppData\\Local\\Temp", [Microsoft.Win32.RegistryValueKind]::ExpandString)
            $envSub.Close()
        }
        $rootKey.Close()

        # Réparation et propagation récursive des permissions internes de la ruche registre
        Write-Host "  -> Propagation récursive des ACLs internes NTUSER.DAT pour $TargetUsername..." -ForegroundColor Yellow
        try {
            $cSharpFixer = @'
using System;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32;

public static class RegAclFixerScript
{
    public static int FixCount = 0;

    public static void Propagate(string rootSubKey, string targetSid)
    {
        FixCount = 0;
        SecurityIdentifier userSid = new SecurityIdentifier(targetSid);
        SecurityIdentifier sysSid = new SecurityIdentifier("S-1-5-18");
        SecurityIdentifier admSid = new SecurityIdentifier("S-1-5-32-544");
        SecurityIdentifier appSid = new SecurityIdentifier("S-1-15-2-1");

        using (RegistryKey root = Registry.LocalMachine.OpenSubKey(rootSubKey, RegistryKeyPermissionCheck.ReadWriteSubTree, RegistryRights.ChangePermissions | RegistryRights.ReadKey | RegistryRights.WriteKey))
        {
            if (root != null)
            {
                Apply(root, userSid, sysSid, admSid, appSid);
            }
        }
    }

    private static void Apply(RegistryKey key, SecurityIdentifier user, SecurityIdentifier sys, SecurityIdentifier adm, SecurityIdentifier app)
    {
        try
        {
            RegistrySecurity sec = key.GetAccessControl();
            AuthorizationRuleCollection rules = sec.GetAccessRules(true, false, typeof(SecurityIdentifier));
            foreach (RegistryAccessRule r in rules)
            {
                if (r.IdentityReference.Value.StartsWith("S-1-5-21-") && r.IdentityReference != user)
                {
                    sec.RemoveAccessRule(r);
                }
            }

            sec.AddAccessRule(new RegistryAccessRule(user, RegistryRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            sec.AddAccessRule(new RegistryAccessRule(sys, RegistryRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            sec.AddAccessRule(new RegistryAccessRule(adm, RegistryRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            sec.AddAccessRule(new RegistryAccessRule(app, RegistryRights.ReadKey, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));

            key.SetAccessControl(sec);
            FixCount++;
        }
        catch { }

        try
        {
            foreach (string subName in key.GetSubKeyNames())
            {
                try
                {
                    using (RegistryKey sub = key.OpenSubKey(subName, RegistryKeyPermissionCheck.ReadWriteSubTree, RegistryRights.ChangePermissions | RegistryRights.ReadKey | RegistryRights.WriteKey))
                    {
                        if (sub != null)
                        {
                            Apply(sub, user, sys, adm, app);
                        }
                    }
                }
                catch { }
            }
        }
        catch { }
    }
}
'@
            if (-not ([System.Management.Automation.PSTypeName]'RegAclFixerScript').Type) {
                Add-Type -TypeDefinition $cSharpFixer -ErrorAction Stop
            }
            [RegAclFixerScript]::Propagate("MAPT_FixHive", $userSid)
            Write-Host "  -> Permissions registre internes NTUSER.DAT propagées récursivement en FullControl à $TargetUsername ($([RegAclFixerScript]::FixCount) clés traitées)." -ForegroundColor Green
        } catch {
            Write-Host "  [!] Note Hive ACL : $($_.Exception.Message)"
        }
    }
    
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    cmd.exe /c "reg.exe unload HKLM\\MAPT_FixHive >nul 2>&1"
}

# 7. Création et structure complète des dossiers AppData et Packages
Write-Host "`n[*] [6/8] Vérification des dossiers système et AppData\\Local\\Packages..." -ForegroundColor Yellow
$packagesDir = "$profPath\\AppData\\Local\\Packages"
if (-not (Test-Path $packagesDir)) {
    New-Item -Path $packagesDir -ItemType Directory -Force | Out-Null
    Write-Host "  -> Dossier '$packagesDir' créé." -ForegroundColor Green
}

$stdFolders = @("Desktop", "Documents", "Downloads", "Music", "Pictures", "Videos", "AppData\\Local", "AppData\\Local\\Temp", "AppData\\Roaming")
foreach ($f in $stdFolders) {
    $p = Join-Path $profPath $f
    if (-not (Test-Path $p)) { New-Item -Path $p -ItemType Directory -Force | Out-Null }
}

# 8. Reconfiguration complète des permissions NTFS et AppContainer
Write-Host "`n[*] [7/8] Réapplication des ACLs NTFS et des conteneurs AppX..." -ForegroundColor Yellow
cmd.exe /c "takeown /f `"$profPath`" /r /a /d O >nul 2>&1"

$sidAcl = "*$($userSid):(OI)(CI)F"
$userAcl = "$($TargetUsername):(OI)(CI)F"

& icacls.exe "$profPath" /inheritance:e /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "*S-1-5-18:(OI)(CI)F" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "*S-1-5-32-544:(OI)(CI)F" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "*S-1-15-2-1:(OI)(CI)RX" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "*S-1-15-2-2:(OI)(CI)RX" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "$sidAcl" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /grant "$userAcl" /t /c /q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-1:(OI)(CI)F" /t /c /q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "*S-1-15-2-2:(OI)(CI)F" /t /c /q 2>&1 | Out-Null
& icacls.exe "$packagesDir" /grant "$sidAcl" /t /c /q 2>&1 | Out-Null
& icacls.exe "$profPath" /setowner "$TargetUsername" /t /c /q 2>&1 | Out-Null
Write-Host "  -> Permissions NTFS et conteneurs d'applications réappliquées avec succès." -ForegroundColor Green

# 9. Validation et réinitialisation de ProfileList avec signature SID binaire
Write-Host "`n[*] [8/8] Inscription propre dans ProfileList avec signature SID..." -ForegroundColor Yellow
$regProf = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$userSid"
if (-not (Test-Path $regProf)) {
    New-Item -Path $regProf -Force | Out-Null
}
Set-ItemProperty -Path $regProf -Name "ProfileImagePath" -Value $profPath -Type ExpandString -Force
Set-ItemProperty -Path $regProf -Name "State" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $regProf -Name "RefCount" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $regProf -Name "Flags" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $regProf -Name "FullProfile" -Value 1 -Type DWord -Force

# Signature SID binaire (obligatoire pour ProfSvc)
$targetSidObj = New-Object System.Security.Principal.SecurityIdentifier($userSid)
$sidBinary = New-Object byte[] ($targetSidObj.BinaryLength)
$targetSidObj.GetBinaryForm($sidBinary, 0)
Set-ItemProperty -Path $regProf -Name "Sid" -Value $sidBinary -Type Binary -Force

$regBak = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$userSid.bak"
if (Test-Path $regBak) { Remove-Item $regBak -Recurse -Force -ErrorAction SilentlyContinue }

if (Test-Path "Registry::HKEY_USERS\\$userSid") {
    Remove-Item "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\History" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "Registry::HKEY_USERS\\$userSid\\Software\\Microsoft\\Windows\\CurrentVersion\\Group Policy\\Status" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "  -> ProfileList réinitialisé avec SID binaire et FullProfile=1." -ForegroundColor Green

Write-Host "`n[✓] Réparation terminée avec succès pour $TargetUsername sur cette machine !" -ForegroundColor Cyan
"""


async def ensure_default_scripts(session: AsyncSession) -> None:
    """
    Initialise les scripts système indispensables dans la bibliothèque MAPT
    s'ils ne sont pas déjà présents.
    """
    try:
        script_check = await session.execute(
            select(Script).where(Script.name == "Reparation Profil Utilisateur Migre").limit(1)
        )
        if not script_check.scalar_one_or_none():
            admin_result = await session.execute(select(User).limit(1))
            admin_owner = admin_result.scalar_one_or_none()
            admin_owner_id = admin_owner.id if admin_owner else None

            repair_script = Script(
                name="Reparation Profil Utilisateur Migre",
                description="Realigne User Shell Folders sur %USERPROFILE%, purge UsrClass.dat.bak, repare les ACLs internes NTUSER.DAT (fix GPSvc Acces refuse) et injecte le SID binaire dans ProfileList.",
                language="powershell",
                created_by=admin_owner_id,
            )
            session.add(repair_script)
            await session.flush()

            sha256_hash = hashlib.sha256(REPAIR_PROFILE_SCRIPT_CONTENT.encode("utf-8")).hexdigest()
            v1 = ScriptVersion(
                script_id=repair_script.id,
                version=1,
                content=REPAIR_PROFILE_SCRIPT_CONTENT,
                sha256=sha256_hash,
                timeout_seconds=600,
                created_by=admin_owner_id,
            )
            session.add(v1)
            await session.commit()
            logger.info("Script système 'Reparation Profil Utilisateur Migre' initialisé dans la bibliothèque.")
    except Exception as e:
        logger.warning(f"Note initialisation des scripts par défaut : {e}")
