# 📦 Guide Complet : Gestion et Déploiement des Packages & Snapins (MAPT)

Ce guide détaille le fonctionnement, la configuration et les meilleures pratiques pour créer, stocker et déployer des logiciels (**MSI**, **EXE**, **VBScript**, **Batch**) sur votre parc informatique Windows via la plateforme **MAPT**.

---

## 📑 Table des Matières

1. [Architecture et Cycle de Vie d'un Déploiement](#1-architecture-et-cycle-de-vie-dun-déploiement)
2. [Comprendre les Champs Snapin (Style FOG)](#2-comprendre-les-champs-snapin-style-fog)
3. [Exemples Concrets par Type de Fichier](#3-exemples-concrets-par-type-de-fichier)
4. [Tableau des Logiciels Courants et Arguments Silencieux](#4-tableau-des-logiciels-courants-et-arguments-silencieux)
5. [Procédure Pas-à-Pas dans l'Interface Web](#5-procédure-pas-à-pas-dans-linterface-web)
6. [Dépannage & Bonnes Pratiques](#6-dépannage--bonnes-pratiques)

---

## 1. Architecture et Cycle de Vie d'un Déploiement

Le déploiement d'un package dans MAPT repose sur un cycle sécurisé en 4 étapes :

```
┌─────────────────────────┐        Upload        ┌────────────────────────────────┐
│  Interface Web (Admin)  │ ───────────────────> │  Serveur MAPT (VM Proxmox)     │
│  Création / Version     │                      │  Stockage MinIO / Local        │
└─────────────────────────┘                      │  Empreinte SHA-256             │
                                                 └───────────────┬────────────────┘
                                                                 │
                                                    Déploiement  │ (HTTPS / Job)
                                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Postes Clients Windows (Agent MAPT)                                             │
│                                                                                 │
│  1. Téléchargement & Vérification Intégrité SHA-256                             │
│  2. Copie locale dans %APPDATA%\MAPT\packages\ (Stockage persistant)           │
│  3. Exécution avec Privilèges Élevés (SYSTEM / Administrateur)                  │
│  4. Remontée en temps réel des codes de sortie et flux de logs vers le serveur │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. **Stockage Centralisé sur le Serveur (VM)** : Les fichiers d'installation sont stockés de manière sécurisée avec leur empreinte SHA-256.
2. **Copie Locale sur la Machine Cible** : L'agent télécharge le fichier dans un dossier local (par exemple `%APPDATA%\MAPT\packages\` ou `%TEMP%`). Le fichier est conservé localement, ce qui permet à l'utilisateur de terminer l'installation si elle requiert une interaction manuelle.
3. **Exécution avec Privilèges** : L'agent lance l'installation selon la configuration définie.
4. **Audit et Suivi** : Les logs (`stdout`, `stderr`) et le code de sortie (`ExitCode`) sont consultables immédiatement dans l'onglet **Déploiements**.

---

## 2. Comprendre les Champs Snapin (Style FOG)

Inspirée du système de Snapins de **FOG Project**, l'exécution s'articule autour de 3 composants pour former la ligne de commande finale :

$$\text{\textbf{[Run With]}} \quad \text{\textbf{[Run With Args]}} \quad \text{"[Chemin_Local_du_Fichier]"} \quad \text{\textbf{[Snapin Arguments]}}$$

### Description des Champs

| Champ | Description | Quand le renseigner ? | Exemple |
| :--- | :--- | :--- | :--- |
| **Snapin Run With** | Le programme hôte / interpréteur qui ouvre le fichier. | **Requis pour `.msi`, `.vbs`, `.ps1`.**<br>Laisser **VIDE** pour un `.exe` direct. | `c:\windows\system32\msiexec.exe`<br>`c:\windows\system32\cscript.exe` |
| **Snapin Run With Args** | Les paramètres passés à l'interpréteur **avant** le fichier. | Utilisé pour indiquer l'action à l'interpréteur (ex: installer pour msiexec). | `/i` (pour MSI)<br>`//nologo` (pour VBS) |
| **Snapin Arguments** | Les options passées à votre propre installeur (mode silencieux). | Utilisé pour rendre l'installation silencieuse sans intervention utilisateur. | `/S`, `/qn /norestart`, `/SILENT` |
| **Exécuter en tant qu'administrateur** | Exécute la commande avec les privilèges système les plus élevés. | **Recommandé activé (coché)** pour la plupart des installations logicielles. | Activé (`true`) |
| **Dossier de destination locale** | Répertoire client où l'exécutable est téléchargé avant d'être exécuté. | Par défaut `%APPDATA%\MAPT\packages`. Les variables `%APPDATA%`, `%TEMP%`, `%PROGRAMDATA%` sont résolues automatiquement. | `%APPDATA%\MAPT\packages` |

---

## 3. Exemples Concrets par Type de Fichier

### A. Fichier Exécutable direct (`.exe`)
*Exemple : 7-Zip (`7z2603-x64.exe`), Notepad++, VLC*
- **Snapin Run With** : *(Laisser vide)*
- **Snapin Run With Args** : *(Laisser vide)*
- **Snapin Arguments** : `/S`
- **Résultat exécuté sur le client** :
  ```cmd
  "C:\Users\Admin\AppData\Roaming\MAPT\packages\7z2603-x64.exe" /S
  ```

### B. Package Windows Installer (`.msi`)
*Exemple : Node.js, Google Chrome MSI, 7-Zip MSI*
- **Snapin Run With** : `c:\windows\system32\msiexec.exe`
- **Snapin Run With Args** : `/i`
- **Snapin Arguments** : `/qn /norestart`
- **Résultat exécuté sur le client** :
  ```cmd
  c:\windows\system32\msiexec.exe /i "C:\Users\Admin\AppData\Roaming\MAPT\packages\googlechromestandaloneenterprise64.msi" /qn /norestart
  ```

### C. Script VBScript (`.vbs`)
*Exemple : Script de configuration d'imprimante ou de nettoyage*
- **Snapin Run With** : `c:\windows\system32\cscript.exe`
- **Snapin Run With Args** : `//nologo`
- **Snapin Arguments** : *(Laisser vide ou paramètres de script)*
- **Résultat exécuté sur le client** :
  ```cmd
  c:\windows\system32\cscript.exe //nologo "C:\Users\Admin\AppData\Roaming\MAPT\packages\config.vbs"
  ```

### D. Script PowerShell (`.ps1`)
*Exemple : Script d'administration avancée*
- **Snapin Run With** : `powershell.exe`
- **Snapin Run With Args** : `-ExecutionPolicy Bypass -File`
- **Snapin Arguments** : `-Verbose`
- **Résultat exécuté sur le client** :
  ```cmd
  powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Admin\AppData\Roaming\MAPT\packages\deploy.ps1" -Verbose
  ```

---

## 4. Tableau des Logiciels Courants et Arguments Silencieux

Voici une référence rapide des arguments silencieux pour les logiciels les plus fréquemment déployés :

| Logiciel | Type | Run With | Run With Args | Snapin Arguments (Silencieux) |
| :--- | :--- | :--- | :--- | :--- |
| **7-Zip** | `.exe` | *(vide)* | *(vide)* | `/S` |
| **7-Zip** | `.msi` | `msiexec.exe` | `/i` | `/qn /norestart` |
| **Notepad++** | `.exe` | *(vide)* | *(vide)* | `/S` |
| **Google Chrome Enterprise** | `.msi` | `msiexec.exe` | `/i` | `/qn /norestart` |
| **Mozilla Firefox** | `.exe` | *(vide)* | *(vide)* | `/s` |
| **Mozilla Firefox** | `.msi` | `msiexec.exe` | `/i` | `/qn /norestart` |
| **VLC Media Player** | `.exe` | *(vide)* | *(vide)* | `/L=1036 /S` *(1036 = Français)* |
| **Adobe Acrobat Reader DC** | `.exe` | *(vide)* | *(vide)* | `/sAll /rs /msi EULA_ACCEPT=YES` |
| **Git for Windows** | `.exe` | *(vide)* | *(vide)* | `/VERYSILENT /NORESTART` |
| **Python 3.x** | `.exe` | *(vide)* | *(vide)* | `/quiet InstallAllUsers=1 PrependPath=1` |
| **Visual Studio Code** | `.exe` | *(vide)* | *(vide)* | `/VERYSILENT /NORESTART /MERGETASKS=!runcode,addtopath` |
| **AnyDesk** | `.exe` | *(vide)* | *(vide)* | `--install "C:\Program Files (x86)\AnyDesk" --silent` |

---

## 5. Procédure Pas-à-Pas dans l'Interface Web

### Créer un Nouveau Package
1. Rendez-vous dans **Packages & Snapins** (`/packages`).
2. Cliquez sur le bouton vert **"Nouveau Package"**.
3. Renseignez le nom (ex: *7-Zip*) et la version initiale (ex: *24.08*).
4. Cliquez dans la zone de fichier ou glissez-déposez votre installateur (`.exe`, `.msi`, `.vbs`, etc.).
   - *MAPT détecte automatiquement l'extension et pré-remplit les paramètres FOG correspondants.*
5. Ajustez si nécessaire les paramètres dans la section **"Paramètres Avancés Snapin"**.
6. Cliquez sur **"Créer et Uploader le Package"**.

### Déployer un Package sur des Machines
1. Sur la carte du package souhaité, cliquez sur **"Déployer"**.
2. Choisissez votre cible de déploiement :
   - **Toutes les machines** : Déploie instantanément sur l'intégralité du parc enregistré.
   - **Sélection manuelle** : Cochez une ou plusieurs machines spécifiques dans la liste.
   - **Par Groupe** : Sélectionnez un groupe de machines prédéfini (ex: *Comptabilité*, *Salle Informatique*).
3. Cliquez sur **"Lancer le Déploiement"**.
4. Suivez la progression en direct en cliquant sur le lien vers la page **Déploiements**.

### Uploader une Nouvelle Version (Mise à jour d'un logiciel)
1. Sur la carte du package existant, cliquez sur **"Version"**.
2. Indiquez le nouveau numéro de version (ex: *26.03*).
3. Sélectionnez le nouveau binaire d'installation.
4. Les paramètres Snapin sont automatiquement pré-ajustés.
5. Cliquez sur **"Uploader la Version"**.

---

## 6. Planification et Exécutions Récurrentes

MAPT intègre un moteur de planification complet permettant d'exécuter des scripts (PowerShell, Python) et packages de façon ponctuelle ou automatisée dans le temps :

```
                               ┌─── Immédiat (Exécution instantanée)
                               ├─── Ponctuel programmé (Date + Heure précise)
Moteur de Planification MAPT ──┼─── Intervalle horaire (Toutes les X heures)
                               ├─── Quotidien (Tous les X jours à HH:MM)
                               ├─── Hebdomadaire (Jours sélectionnés : Lun, Mar, Mer... à HH:MM)
                               ├─── Mensuel / Annuel (À HH:MM)
                               └─── Expression Cron avancée (ex: 0 4 * * 1-5)
```

### Modes de Planification Disponibles

1. **Immédiat** : Le job est dispatché directement auprès des agents connectés.
2. **Programmé (Date précise)** : Le job reste en attente (`PENDING`) jusqu'à ce que la date et heure choisies soient atteintes.
3. **Récurrent : Heures (Intervalle)** : Relance automatique toutes les $X$ heures (ex : script d'inventaire ou de synchronisation toutes les 4 heures).
4. **Récurrent : Quotidien** : Exécution tous les $X$ jours à une heure définie (ex : audit de sécurité tous les jours à 08:00).
5. **Récurrent : Hebdomadaire** : Sélection des jours de la semaine (Lun, Mar, Mer, Jeu, Ven, Sam, Dim) et de l'heure d'exécution.
6. **Récurrent : Mensuel / Annuel** : Exécution mensuelle ou annuelle pour les tâches de clôture et de maintenance.
7. **Récurrent : Cron** : Pour les administrateurs avancés, prise en charge des expressions Cron à 5 champs standard (ex : `*/30 * * * *` pour toutes les 30 min).

### Suivi dans le Dashboard Déploiements

- **Badge Récurrent** : Indique le rythme (`🔁 Quotidien à 08:00`, `🔁 Hebdo (Lun, Mer, Ven) à 12:00`, etc.).
- **Prochaine Exécution** : Affiche la date et l'heure précises calculées par le planificateur (`Prochaine : 18/09/2026 à 08:00`).
- **Filtres Dédiés** : Accédez d'un clic aux jobs actifs, récurrents ou terminés.

---

## 7. Dépannage & Bonnes Pratiques

- **Le téléversement d'un package volumineux s'arrête ou se bloque (ex: à quelques Mo)** : Si un proxy d'entreprise (ex: Squid, filtrage web) est configuré sur les postes de travail, assurez-vous que l'adresse IP du serveur MAPT (`192.168.224.236` ou `192.168.*`) est bien inscrite dans les exceptions de proxy Windows (*Options Internet &rarr; Paramètres réseau &rarr; Ne pas utiliser de serveur proxy pour les adresses locales / Exceptions*). NGINX est configuré avec `proxy_request_buffering off;` pour streamer les gros fichiers directement vers le serveur.
- **Mon installateur `.exe` ne s'exécute pas en silencieux** : Vérifiez la documentation de l'éditeur pour connaître le commutateur exact (`/S`, `/s`, `/silent`, `/VERYSILENT` ou `/qn`). Si aucun commutateur silencieux n'existe, l'exécutable restera stocké dans `%ProgramData%\MAPT\packages` pour permettre à l'utilisateur de cliquer sur l'interface d'installation si le mode interactif est sélectionné.
- **Code de sortie 3010 pour un `.msi`** : Le code `3010` indique un succès avec redémarrage nécessaire (*Reboot Required*). L'installation s'est bien terminée.
- **Droits insuffisants** : Laissez toujours la case *"Exécuter en tant qu'administrateur"* cochée pour permettre l'écriture dans `C:\Program Files` et la modification de la base de registre Windows.
