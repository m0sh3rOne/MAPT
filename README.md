# MAPT — Plateforme de Déploiement et d'Administration de Parc

MAPT est une solution client/serveur d'administration et de gestion de parc informatique centralisée basée sur un **modèle Pull sécurisé** (l'agent interroge le serveur en HTTPS/TLS, le serveur n'initie jamais de connexion directe vers les postes clients).

---

## 1. Architecture Générale

```text
       [ Administrateur ]
               |
               v HTTPS
       [ Interface Web React / TypeScript (Vite) ]
               |
               v
       [ Reverse Proxy (Caddy / Nginx) ]
               |
               v
       [ Backend API FastAPI (Python 3.12+) ]
         ├──> [ PostgreSQL 16 ] (Métadonnées & Audit)
         ├──> [ Redis 7 ] (Files de messages & Cache)
         ├──> [ MinIO S3 ] (Stockage des packages MSI / EXE)
         └──> [ Worker Asynchrone (Arq) ] (Timeouts & Health)
                 ^
                 | HTTPS / Polling (Pull 30s)
       [ Agent Windows (Go) ]
         ├── Service Windows / Standalone
         ├── Enrôlement & Heartbeat
         ├── Inventaire Matériel & Système
         └── Exécuteurs (MSI silencieux, PowerShell, Python, CMD)
```

---

## 2. Fonctionnalités Clés

- **Déploiement de Packages MSI / EXE** : Upload avec calcul automatique du hash SHA-256, stockage S3 sur MinIO, téléchargement vérifié et installation silencieuse (`msiexec.exe`).
- **Exécution de Scripts PowerShell & Python** : Édition avec versioning immuable (chaque modification crée une nouvelle version), exécution isolée avec timeout strict, capture des codes retour et streaming des logs.
- **Inventaire Matériel & Réseau** : Remontée automatique des CPU, RAM, Stockage (total/libre), adresses MAC, interfaces réseau et utilisateur connecté.
- **Gestion des Groupes** : Organisation logique des postes pour le ciblage massif.
- **Machine à États Robuste** : `PENDING` $\rightarrow$ `OFFERED` $\rightarrow$ `ACKED` $\rightarrow$ `RUNNING` $\rightarrow$ (`SUCCEEDED` / `FAILED` / `TIMED_OUT` / `CANCELLED`).
- **Journal d'Audit Intégral** : Traçabilité immuable de toutes les actions administratives.
- **Relance (Retry)** : Bouton de relance granulaire par machine en cas d'échec.

---

## 3. Prérequis des Postes Clients Windows

- **OS** : Windows 10 (1809+), Windows 11, Windows Server 2016/2019/2022/2025 (x64 / x86).
- **Droits** : Privilèges Administrateur Local ou compte `NT AUTHORITY\SYSTEM` (utilisé automatiquement en mode Service Windows).
- **Interpréteurs natifs** : PowerShell 5.1+ (`-ExecutionPolicy Bypass`), `cscript.exe` (VBScript), `cmd.exe` (Batch), `msiexec.exe` (MSI). Python 3.x optionnel si scripts `.py`.
- **Réseau** : Flux sortant uniquement (Pull Model) vers le serveur MAPT sur le port HTTP (80/8088) ou HTTPS (443). Aucun port entrant à ouvrir sur le poste client.
- **Détails complets** : Voir [GUIDE_DEPLOIEMENT_AGENT.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_AGENT.md).

---

## 4. Déploiement & Démarrage

### Option A — Déploiement en Production sur VM Ubuntu (Proxmox / KVM / Cloud)

Un script tout-en-un configure Docker, compile l'agent Windows et lance les 6 conteneurs :

```bash
git clone https://github.com/m0sh3rOne/MAPT.git /opt/MAPT
cd /opt/MAPT
sudo ./scripts/install-server-production.sh
```

- **Interface Web & Téléchargement Agent** : `http://<IP_DE_VOTRE_VM>`
- **Guide de déploiement de l'Agent Windows (FOG, GPO, PowerShell)** : Voir [GUIDE_DEPLOIEMENT_AGENT.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_AGENT.md).
- **Documentation complète Serveur Proxmox** : Voir [GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md).
- **Guide des Packages & Snapins** : Voir [GUIDE_UTILISATION_PACKAGES_SNAPINS.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_UTILISATION_PACKAGES_SNAPINS.md).

### Option B — Démarrage du Serveur de Test sous WSL2 Ubuntu (Machine de Dev)

Cette méthode permet de tester et développer l'ensemble de la stack directement sur votre machine de développement avec Ubuntu sous WSL2 et l'Agent sous Windows.

#### 1. Initialisation de l'environnement WSL (à faire la première fois)
Dans un terminal WSL Ubuntu (ou depuis PowerShell via `wsl`) :
```bash
# Se placer dans le répertoire du projet
cd /mnt/c/Users/Admin/Documents/Github/MAPT

# Exécuter le script de configuration
./scripts/setup-wsl-environment.sh
```
*Ce script installe PostgreSQL, Redis, MinIO S3, Go, et initialise l'environnement virtuel Python (`backend/venv`).*

#### 2. Démarrage de la stack serveur (PostgreSQL, Redis, MinIO, Backend, Worker)
Exécutez le script de démarrage global :
```bash
./scripts/start-all.sh
```
Ou lancez-le directement depuis PowerShell :
```powershell
wsl -d Ubuntu -u UBUNTU bash -c "/mnt/c/Users/Admin/Documents/Github/MAPT/scripts/start-all.sh"
```
**Services démarrés :**
- **API REST FastAPI** : [http://localhost:8088/api/v1](http://localhost:8088/api/v1)
- **Documentation Swagger** : [http://localhost:8088/api/v1/docs](http://localhost:8088/api/v1/docs)
- **Console MinIO S3** : [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)

#### 3. Démarrage de l'Interface Web (Frontend React)
Dans un terminal Windows (PowerShell / CMD) :
```powershell
cd frontend
npm install
npm run dev
```
- **Accès Web** : [http://localhost:5173](http://localhost:5173)
- **Identifiants par défaut** : `admin` / `Admin123!`

#### 4. Lancement de l'Agent Windows de Test
Dans un second terminal Windows :
```powershell
scripts\run-agent-windows.bat
```
ou directement :
```powershell
cd agent
.\mapt-agent.exe -server "http://localhost:8088/api/v1"
```
*L'agent s'enrôle automatiquement, transmet l'inventaire matériel et commence à écouter les jobs.*

#### 5. Validation rapide avec le test End-to-End automatisé
Pour vérifier toute la chaîne (Auth $\rightarrow$ Flotte $\rightarrow$ Inventaire $\rightarrow$ Script $\rightarrow$ Déploiement $\rightarrow$ Complétion) :
```bash
wsl -d Ubuntu -u UBUNTU bash -c "python3 /mnt/c/Users/Admin/Documents/Github/MAPT/scripts/test_flow.py"
```

### Option C — Téléchargement et Enrôlement de l'Agent Windows sur un poste client

1. **Depuis l'interface Web** : Cliquez sur **"Télécharger l'Agent Windows"** dans la barre supérieure ou sur la page Parc Machines.
2. **En ligne de commande PowerShell** sur un poste Windows :
   ```powershell
   # Téléchargement direct depuis le serveur
   Invoke-WebRequest -Uri "http://<IP_SERVEUR>:8088/api/v1/agent/download/windows" -OutFile "mapt-agent.exe"

   # Enrôlement Standalone
   .\mapt-agent.exe -server "http://<IP_SERVEUR>:8088/api/v1" -enroll-token "mapt-enroll-secret-token-2026"

   # Ou installation en Service Windows (démarrage automatique au boot)
   .\mapt-agent.exe -service install -server "http://<IP_SERVEUR>:8088/api/v1" -enroll-token "mapt-enroll-secret-token-2026"
   ```

3. **Déploiement massif via Snapin FOG Project** :
   Consultez la [Section 5 du Guide de Déploiement Proxmox](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md#5-d%C3%A9ploiement-automatis%C3%A9-de-lagent-via-fog-project-snapin-fog) pour pousser l'Agent automatiquement après clonage ou à la volée sur vos postes FOG.

---

## 4. Structure du Projet

```text
MAPT/
├── backend/                  # API FastAPI, SQLAlchemy 2.0, Workers, MinIO
│   ├── app/
│   │   ├── api/             # Routes REST versionnées (/admin, /agent, /auth)
│   │   ├── core/            # Config, Base de données, Sécurité JWT/RBAC
│   │   ├── models/          # Modèles SQLAlchemy (Users, Devices, Deployments, etc.)
│   │   ├── repositories/    # Requêtes et persistance
│   │   ├── schemas/         # Schémas de validation Pydantic v2
│   │   ├── services/        # Logique métier et machine à états
│   │   ├── storage/         # Client MinIO S3
│   │   └── workers/         # Worker asynchrone
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Application React 18, TypeScript, Vite, Tailwind CSS
│   ├── src/
│   │   ├── pages/           # Dashboard, Devices, Deployments, Packages, Scripts, Groups, Audit
│   │   ├── components/      # Layout, Sidebar, Navbar
│   │   └── services/        # Client Axios intercepté
│   └── package.json
│
├── agent/                    # Agent Windows natif en Go
│   ├── cmd/agent/           # Point d'entrée CLI & Service
│   ├── internal/
│   │   ├── api/             # Client HTTP sécurisé
│   │   ├── download/        # Downloader avec vérification SHA-256
│   │   ├── inventory/       # Collecteur WMI & Réseau
│   │   └── jobs/            # Exécuteurs MSI, PowerShell, Python, CMD
│   └── mapt-agent.exe       # Binaire Windows 64-bit compilé
├── infrastructure/           # Docker Compose, Caddyfile
└── scripts/                  # Scripts d'automatisation (WSL, Agent, Déploiement)
```

---

## 5. Documentation & Guides Pratiques

- 📘 [Guide de Déploiement Serveur Proxmox / Production](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md) : Déploiement complet automatisé du serveur MAPT sur une machine virtuelle Ubuntu.
- 📦 [Guide d'Utilisation des Packages & Snapins FOG](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_UTILISATION_PACKAGES_SNAPINS.md) : Création, gestion, arguments d'installation silencieuse et déploiement de logiciels (.MSI, .EXE, .VBS).
- 📜 [Documentation d'Architecture](file:///c:/Users/Admin/Documents/Github/MAPT/documentation_architecture_plateforme_deploiement.md) : Spécifications techniques complètes de la plateforme.
