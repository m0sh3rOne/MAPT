# 🚀 Guide de Déploiement de l'Agent MAPT

Ce guide rapide résume toutes les méthodes pour déployer automatiquement et massivement l'**Agent Windows MAPT** sur votre parc informatique.

---

## 📋 1. Prérequis du Poste Windows Client

Pour que l'Agent MAPT, l'inventaire matériel/logiciel, les déploiements de logiciels et l'exécution de scripts fonctionnent sans accroc sur les machines de votre parc :

### A. Système d'Exploitation & Architecture
- **Versions supportées** : Windows 10 (1809 ou supérieur), Windows 11 (toutes versions), Windows Server 2016, 2019, 2022 et 2025.
- **Architecture** : 64 bits (x64 / AMD64) ou 32 bits (x86).
- **Ressources requises** : Moins de 20 Mo de RAM, moins de 1% CPU en veille.

### B. Privilèges & Droits Système
- **Droits Administrateur Local ou Compte `SYSTEM` (`NT AUTHORITY\SYSTEM`)** :
  - Requis pour enregistrer et démarrer le Service Windows (`-service install`).
  - Requis pour l'installation silencieuse de packages MSI/EXE dans `C:\Program Files` et les modifications du Registre machine `HKLM`.
  - *Remarque* : Lorsque l'agent tourne en tant que Service Windows, il s'exécute automatiquement sous le compte `SYSTEM` avec tous les privilèges requis.

### C. Moteurs & Interpréteurs Intégrés (Par défaut sur Windows)
Aucun composant lourd (.NET Framework spécifique, Java, etc.) n'est requis car l'Agent est compilé en binaire natif Go autonome :
- **PowerShell 5.1+** : Intégré nativement dans tous les Windows 10/11/Server. Utilisé pour l'inventaire WMI/CIM et les scripts `.ps1`. L'agent applique automatiquement `-ExecutionPolicy Bypass`, aucune modification globale de la politique de sécurité du domaine n'est requise.
- **Windows Script Host (`cscript.exe`)** : Intégré nativement pour exécuter les scripts VBScript (`.vbs`).
- **Invite de commande (`cmd.exe`)** : Intégrée nativement pour les scripts Batch (`.bat`, `.cmd`) et les commandes directes (`msg.exe`, `net.exe`, `shutdown.exe`).
- **Windows Installer (`msiexec.exe`)** : Intégré nativement pour les packages `.msi`.
- **Optionnel (Python)** : Si vous déployez des scripts `.py`, l'interpréteur `python.exe` doit être installé sur la machine ou déployé au préalable via un package MAPT.

### D. Flux Réseau & Pare-feu (Firewall)
- **Modèle PULL / Télémétrie (Sortant Uniquement)** :
  - L'agent initie **toutes** les communications vers le serveur MAPT.
  - **Aucun port entrant n'a besoin d'être ouvert sur les postes clients**.
  - **Port Sortant vers le serveur MAPT** : Port `80` (HTTP) ou `443` (HTTPS) / `8088` (si port dev).
  - Résolution DNS ou routage IP valide vers le serveur MAPT.

### E. Antivirus, EDR & Politiques de restriction logicielle
- Si votre parc utilise un EDR strict (ex: Defender for Endpoint, SentinelOne, Crowdstrike) ou AppLocker/WDAC :
  - Autoriser l'exécutable `mapt-agent.exe` (ou le signer avec le certificat de votre autorité de certification PKI d'entreprise).
  - Autoriser la persistance du service Windows nommé `mapt-agent`.

---

## 🔑 2. Paramètres de Connexion Requis

| Paramètre | Description | Exemple |
| :--- | :--- | :--- |
| **URL du Serveur** | Point d'entrée de l'API MAPT | `http://192.168.1.150/api/v1` |
| **Jeton d'enrôlement (`$enrollToken`)** | Passphrase définie lors de l'installation du serveur | `MonSecretEntreprise2026!` |
| **URL de téléchargement direct** | Binaire client officiel généré par le serveur | `http://<IP_SERVEUR>/api/v1/agent/download/windows` |

---

## 🎯 3. Méthode 1 — Déploiement Massif via FOG Project (Snapin FOG)

Cette méthode permet de pousser l'agent MAPT sur des centaines de postes (ou automatiquement à la fin d'un re-clonage d'image).

### Option A : Snapin Simple (Exécutable direct)
1. Téléchargez `mapt-agent.exe` depuis l'interface MAPT (`http://<IP_SERVEUR>/api/v1/agent/download/windows`).
2. Rendez-vous sur la console **FOG Management** (`http://<IP_FOG>/fog`).
3. Allez dans **Snapin Management** ➡️ **Create New Snapin** :
   - **Snapin Name** : `MAPT - Agent Windows Service`
   - **Snapin Run With** : *(Laisser vide)*
   - **Snapin File** : Uploadez `mapt-agent.exe`
   - **Snapin Arguments** : 
     ```text
     -service install -server "http://<IP_SERVEUR>/api/v1" -enroll-token "<VOTRE_ENROLL_TOKEN>"
     ```
   - **Reboot after install** : `Non`
4. Cliquez sur **Add**.
5. Associez le Snapin à vos machines ou à un groupe d'hôtes FOG, puis lancez la tâche **Single Snapin Deploy**.

---

### Option B : Snapin PowerShell FOG (Recommandé - Autonome et Robuste)
Idéal pour garantir que la dernière version est toujours téléchargée directement depuis MAPT avec configuration automatique :

1. Dans FOG, créez un fichier `install-MAPT.ps1` contenant le script suivant :
   ```powershell
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]'Tls12,Tls11,Tls'
   $serverBase = "http://192.168.224.236"
   $serverApi = "$serverBase/api/v1"
   $enrollToken = "mapt-enroll-n044u01jvgtbwkbr"

   # 1. Dossier d'installation 64-bit même sous processus 32-bit (FOG Client)
   $progFiles = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
   $installDir = Join-Path $progFiles "MAPT"
   if (-not (Test-Path $installDir)) {
       [System.IO.Directory]::CreateDirectory($installDir) | Out-Null
   }

   $agentExe = Join-Path $installDir "mapt-agent.exe"
   $configFile = Join-Path $installDir "mapt-agent-config.json"

   # 2. Arrêt des services et processus existants
   Stop-Service -Name "mapt-agent" -Force -ErrorAction SilentlyContinue
   Get-Process -Name "mapt-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
   Start-Sleep -Seconds 1

   # 3. Téléchargement du binaire agent
   $downloadUrl = "$serverApi/agent/download/windows"
   $wc = New-Object System.Net.WebClient
   $wc.Headers.Add("User-Agent", "FOG-Snapin-Installer")
   $wc.DownloadFile($downloadUrl, $agentExe)

   # 4. Identification machine persistante et détection anti-collision clone
   $deviceUuid = ""
   if (Test-Path $configFile) {
       try {
           $existingCfg = Get-Content $configFile -Raw | ConvertFrom-Json
           if ($existingCfg.device_uuid) { $deviceUuid = $existingCfg.device_uuid }
       } catch {}
   }
   if (-not $deviceUuid) {
       try {
           $deviceUuid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid
       } catch {}
   }
   if (-not $deviceUuid) {
       try {
           $deviceUuid = (Get-CimInstance -Class Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
       } catch {}
   }

   # Vérification auprès du serveur si cet UUID est déjà pris par un autre hostname (Clone FOG)
   $isCloneConflict = $false
   if ($deviceUuid) {
       try {
           $check = Invoke-RestMethod -Uri "$serverApi/agent/check-uuid?uuid=$deviceUuid&hostname=$env:COMPUTERNAME" -Method Get -TimeoutSec 4 -ErrorAction SilentlyContinue
           if ($check -and $check.conflict -eq $true) {
               $isCloneConflict = $true
           }
       } catch {}
   }

   # Si conflit de clone ou UUID absent, générer un nouvel UUID unique et mettre à jour le Registre Windows
   if ($isCloneConflict -or -not $deviceUuid) {
       $deviceUuid = [Guid]::NewGuid().ToString()
       Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name "MachineGuid" -Value $deviceUuid -Force -ErrorAction SilentlyContinue
   }

   $configJson = @"
   {
     "server_url": "$serverApi",
     "enrollment_token": "$enrollToken",
     "device_uuid": "$deviceUuid",
     "agent_token": "",
     "poll_interval_seconds": 30,
     "heartbeat_interval_seconds": 30,
     "inventory_interval_seconds": 3600,
     "agent_version": "1.0.0"
   }
   "@

   $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
   [System.IO.File]::WriteAllText($configFile, $configJson, $utf8NoBom)

   # 5. Enregistrement et Démarrage du Service Windows (sans suppression pour éviter l'erreur Windows 1072)
   $svc = Get-Service -Name "mapt-agent" -ErrorAction SilentlyContinue

   if (-not $svc) {
       & "$agentExe" -service install 2>&1 | Out-Null
       Start-Sleep -Seconds 1
       $svc = Get-Service -Name "mapt-agent" -ErrorAction SilentlyContinue
   }

   if (-not $svc) {
       & sc.exe create "mapt-agent" binPath= "`"$agentExe`"" start= auto DisplayName= "MAPT Endpoint Agent" | Out-Null
       & sc.exe description "mapt-agent" "Service d'administration, d'inventaire et de telemetrie MAPT pour Windows" | Out-Null
       Start-Sleep -Seconds 1
   } else {
       & sc.exe config "mapt-agent" binPath= "`"$agentExe`"" start= auto | Out-Null
   }

   # 6. Démarrage du service
   Start-Service -Name "mapt-agent" -ErrorAction SilentlyContinue
   Start-Sleep -Seconds 2
   & sc.exe start "mapt-agent" 2>&1 | Out-Null
   ```
2. Dans FOG ➡️ **Snapin Management** :
   - **Snapin Name** : `MAPT-Agent`
   - **Snapin Run With** : `powershell.exe`
   - **Snapin Run With Args** : `-ExecutionPolicy Bypass -NoProfile -File`
   - **Snapin File** : `install-MAPT.ps1`

---

## 🏢 4. Méthode 2 — Déploiement par GPO Active Directory (Script de démarrage Machine)

Le script s'exécute avec les privilèges `SYSTEM` au démarrage des ordinateurs du domaine.

1. Créez un script batch `install-mapt.bat` dans le partage réseau `NETLOGON` ou `SYSVOL` :
   ```batch
   @echo off
   if exist "C:\Program Files\MAPT\mapt-agent.exe" goto end

   mkdir "C:\Program Files\MAPT"
   curl.exe -s -o "C:\Program Files\MAPT\mapt-agent.exe" http://<IP_SERVEUR>/api/v1/agent/download/windows

   "C:\Program Files\MAPT\mapt-agent.exe" -service install -server "http://<IP_SERVEUR>/api/v1" -enroll-token "<VOTRE_ENROLL_TOKEN>"
   "C:\Program Files\MAPT\mapt-agent.exe" -service start

   :end
   ```
2. Dans la console de **Gestion des Stratégies de Groupe (GPMC)** :
   - Créez ou modifiez une GPO liée à l'OU contenant vos postes clients.
   - Rendez-vous dans : **Configuration ordinateur** ➡️ **Stratégies** ➡️ **Paramètres Windows** ➡️ **Scripts (démarrage/arrêt)** ➡️ **Démarrage**.
   - Ajoutez le fichier `install-mapt.bat`.

---

## 💻 5. Méthode 3 — Installation Manuelle ou Scriptée (PowerShell Administrateur)

Sur un poste Windows, ouvrez **PowerShell en tant qu'Administrateur** et exécutez ce one-liner :

```powershell
# Définir les variables
$server = "http://<IP_SERVEUR>/api/v1"
$token = "<VOTRE_ENROLL_TOKEN>"

# Télécharger l'agent
curl.exe -o mapt-agent.exe "$server/agent/download/windows"

# Installer en service Windows persistant et démarrer
.\mapt-agent.exe -service install -server "$server" -enroll-token "$token"
.\mapt-agent.exe -service start
```

---

## 🛠️ 6. Méthode 4 — Outils de Télé-déploiement (PDQ Deploy, Intune, SCCM, etc.)

| Champ | Valeur à renseigner |
| :--- | :--- |
| **Install File** | `mapt-agent.exe` |
| **Parameters / Arguments** | `-service install -server "http://<IP_SERVEUR>/api/v1" -enroll-token "<VOTRE_ENROLL_TOKEN>"` |
| **Post-install Step** | Commande : `mapt-agent.exe -service start` *(ou `net start mapt-agent`)* |
| **Contexte d'exécution** | `Local System (SYSTEM)` |

---

## 🔍 7. Commandes Utiles de Gestion du Service Client

Toutes ces commandes s'exécutent en Administrateur sur le poste client :

```powershell
# Vérifier l'état du service
Get-Service mapt-agent
sc.exe query mapt-agent

# Démarrer / Arrêter / Redémarrer
.\mapt-agent.exe -service start
.\mapt-agent.exe -service stop
.\mapt-agent.exe -service restart

# Désinstaller complètement l'agent
.\mapt-agent.exe -service stop
.\mapt-agent.exe -service uninstall
```

---

## ✅ 8. Validation du Déploiement

1. Connectez-vous sur votre tableau de bord MAPT : `http://<IP_SERVEUR>`.
2. Allez sur la page **Parc Machines** (`/devices`).
3. Les nouvelles machines apparaissent instantanément avec :
   - Statut **En ligne** (pastille verte).
   - Inventaire matériel complet (CPU, RAM, Disque, Cartes réseau).
   - Inventaire logiciel et liste des utilisateurs locaux.
