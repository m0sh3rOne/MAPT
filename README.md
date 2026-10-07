# MAPT — Plateforme de Déploiement et d'Administration de Parc

MAPT est une solution client/serveur d'administration et de gestion de parc informatique centralisée basée sur un **modèle Pull sécurisé** (l'agent interroge le serveur en HTTPS/TLS, le serveur n'initie jamais de connexion directe vers les postes clients).

---

## 1. Architecture Générale

```text
       [ Administrateur / Assistant IA (MCP) ]
                |
                v HTTPS / MCP stdio / SSE
       [ Interface Web React / TypeScript (Vite) ]  <--->  [ Serveur MCP MAPT ]
                |                                                 |
                v                                                 v
       [ Reverse Proxy (Caddy / Nginx) ] <────────────────────────┘
                |
                v
       [ Backend API FastAPI (Python 3.12+) ]
         ├──> [ PostgreSQL 16 ] (Métadonnées, RBAC & Audit)
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

- **Déploiement de Packages MSI / EXE** : Upload avec calcul automatique du hash SHA-256, stockage S3 sur MinIO, téléchargement vérifié et installation silencieuse (`msiexec.exe`, installateurs autonomes).
- **Exécution de Scripts PowerShell, Python, Batch & VBS** : Édition avec versioning immuable (chaque modification crée une nouvelle version), exécution isolée avec timeout strict, encodage UTF-16LE sécurisé, capture des codes retour et streaming des logs.
- **Inventaire Matériel, Réseau & Utilisateurs** : Remontée automatique des CPU, RAM, Stockage (total/libre), adresses MAC, interfaces réseau, build OS et utilisateur connecté en session active.
- **Gestion des Groupes & Assignation des Membres** : Organisation logique des postes pour le ciblage massif et assignation fine d'opérateurs ou clients applicatifs habilités par groupe.
- **Modèle de Rôles & Sécurité RBAC Granulaire** : Ségrégation stricte des privilèges (Super Admin, Administrateur, Opérateur restreint, Client App Store, Lecteur).
- **Serveur MCP Intégré (Model Context Protocol)** : Pilotage complet et automatisé de la flotte par des assistants IA (Google Antigravity IDE, Claude Desktop, Cursor, VS Code).
- **Actions Rapides Distantes** : Réveil par paquet magique (Wake-on-LAN), redémarrage, extinction planifiée, envoi de messages et configuration d'Auto-Logon.
- **Machine à États Robuste** : `PENDING` $\rightarrow$ `OFFERED` $\rightarrow$ `ACKED` $\rightarrow$ `RUNNING` $\rightarrow$ (`SUCCEEDED` / `FAILED` / `TIMED_OUT` / `CANCELLED`).
- **Journal d'Audit Intégral** : Traçabilité immuable de toutes les actions administratives avec horodatage, auteur, adresse IP et cibles.
- **Relance (Retry)** : Bouton de relance granulaire par machine en cas d'échec de déploiement.

---

## 3. Modèle de Rôles & Sécurité (RBAC)

La plateforme MAPT implémente une matrice de sécurité stricte à **5 niveaux de privilèges** :

### Tableau des Rôles & Permissions

| Rôle | Catalogue Packages MSI/EXE | Scripts PowerShell / Python | Déploiement & Actions Distantes | Gestion des Groupes & Assignation | Gestion Utilisateurs & Système |
| :--- | :---: | :---: | :---: | :---: | :---: |
| 🛡️ **Super Admin** | ✅ Création, modif & déploiement | ✅ Création, édition & exécution | ✅ **Tout le parc** | ✅ Complète (Groupes + Membres) | ✅ **Complète + Serveur MCP** |
| 👑 **Administrateur** | ✅ Création, modif & déploiement | ✅ Création, édition & exécution | ✅ **Tout le parc** | ✅ Complète (Groupes + Membres) | ❌ Non |
| ⚙️ **Opérateur** | ❌ Création interdite / Déploiement ✅ | ❌ Édition interdite / Exécution ✅ | ✅ **Groupes assignés uniquement** | ❌ Modification interdite | ❌ Non |
| 🛍️ **Client App Store** | ❌ Création interdite / Déploiement ✅ | ❌ **Non (Masqué & Interdit)** | ✅ **Packages sur groupes assignés uniquement** | ❌ Modification interdite | ❌ Non |
| 👁️ **Lecteur** | 👁️ Consultation seule | 👁️ Consultation seule | ❌ Non | 👁️ Consultation seule | ❌ Non |

### Zoom sur le rôle 🛍️ **Client App Store** (`app_store_client`)
Le rôle **Client App Store** est spécialement conçu pour les **enseignants, gestionnaires applicatifs ou référents de salles informatiques** :
- **Autonomie sécurisée** : Permet d'installer des logiciels certifiés du catalogue officiel sur les ordinateurs des salles ou groupes auxquels le compte a été expressément rattaché par un administrateur.
- **Isolation stricte** : L'accès aux scripts personnalisés (PowerShell, Python, Batch), aux commandes terminal arbitraires, aux extinctions distantes et aux paramètres système est totalement masqué dans l'interface et verrouillé côté API (rejet HTTP `403 Forbidden`).
- **Aucun risque pour le parc global** : Le ciblage de l'ensemble du parc est strictement interdit.

> 📖 *Pour consulter la matrice détaillée des droits, référez-vous au [GUIDE_GESTION_ROLES_PERMISSIONS.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_GESTION_ROLES_PERMISSIONS.md).*

---

## 4. Serveur MCP (Model Context Protocol)

MAPT intègre un serveur MCP natif ([`mcp/server.py`](file:///c:/Users/Admin/Documents/Github/MAPT/mcp/server.py)) conforme au standard ouvert [Model Context Protocol](https://modelcontextprotocol.io/). Il permet de connecter des assistants d'IA générative pour analyser le parc, diagnostiquer des pannes ou orchestrer des déploiements.

### Catalogue des 15 Outils MCP Disponibles

| Outil | Catégorie | Description |
| :--- | :--- | :--- |
| `mapt_list_devices` | Inventaire | Liste toutes les machines avec statut en ligne, IP, MAC, OS et dernière vue. |
| `mapt_get_device` | Inventaire | Fiche technique détaillée (processeur, RAM, stockage, interfaces, logiciels installés). |
| `mapt_find_device_by_name` | Inventaire | Recherche rapide d'une machine par son nom d'hôte NetBIOS (ex: `PC-LABO-01`). |
| `mapt_run_command` | Exécution | Exécute une commande personnalisée ou un script PowerShell/CMD à distance. |
| `mapt_get_deployment_status` | Déploiement | Vérifie l'état d'avancement d'un déploiement ou d'un script en temps réel. |
| `mapt_get_target_logs` | Déploiement | Récupère la sortie console (`stdout` / `stderr`) retournée par l'agent Windows. |
| `mapt_cancel_deployment` | Déploiement | Interrompt un déploiement ou un travail en cours sur les machines cibles. |
| `mapt_wake_device` | Alimentation | Allume un poste à distance par paquet magique Wake-on-LAN (WoL). |
| `mapt_reboot_device` | Alimentation | Redémarre à distance un ou plusieurs postes avec avertissement utilisateur. |
| `mapt_shutdown_device` | Alimentation | Éteint proprement à distance des postes (délai de sécurité paramétrable). |
| `mapt_list_groups` | Organisation | Liste les groupes logiques de machines et leurs membres assignés. |
| `mapt_list_scripts` | Bibliothèque | Liste les scripts enregistrés dans la bibliothèque officielle MAPT. |
| `mapt_create_script` | Bibliothèque | Crée et intègre un nouveau script PowerShell/Python directement dans MAPT. |
| `mapt_get_script` | Bibliothèque | Récupère le code source et les métadonnées d'un script existant. |
| `mapt_deploy_script` | Bibliothèque | Déploie et lance un script du catalogue sur des machines ou des groupes. |

### Configuration Rapide (Google Antigravity / Claude Desktop)

Dans votre fichier `mcp_config.json` ou `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "mapt-admin": {
      "command": "python",
      "args": ["/chemin/vers/MAPT/mcp/server.py"],
      "env": {
        "MAPT_API_URL": "http://<IP_SERVEUR_MAPT>/api/v1",
        "MAPT_USERNAME": "admin",
        "MAPT_PASSWORD": "votre_mot_de_passe_securise",
        "MAPT_VERIFY_SSL": "false"
      }
    }
  }
}
```

> 📖 *Pour plus de détails (mode HTTP/SSE, Cursor, VS Code), consultez le [ConfigMCP.md](file:///c:/Users/Admin/Documents/Github/MAPT/ConfigMCP.md).*

---

## 5. Prérequis des Postes Clients Windows

- **Système d'exploitation** : Windows 10 (1809+), Windows 11, Windows Server 2016/2019/2022/2025 (x64 / x86).
- **Droits d'exécution** : Privilèges Administrateur Local ou compte `NT AUTHORITY\SYSTEM` (utilisé par défaut en mode Service Windows).
- **Interpréteurs natifs** : PowerShell 5.1+ (`-ExecutionPolicy Bypass`), `cmd.exe` (Batch), `cscript.exe` (VBScript), `msiexec.exe` (MSI). Python 3.x optionnel pour les scripts `.py`.
- **Réseau** : Flux sortant uniquement (Pull Model) vers le serveur MAPT sur le port HTTP (80/8088) ou HTTPS (443). Aucun port entrant à ouvrir sur le poste client.
- **Guide complet** : Voir [GUIDE_DEPLOIEMENT_AGENT.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_AGENT.md).

---

## 6. Déploiement & Démarrage

### Option A — Déploiement en Production sur VM Ubuntu (Proxmox / KVM / Cloud)

Un script tout-en-un configure Docker, compile l'agent Windows et démarre l'ensemble des conteneurs :

```bash
git clone https://github.com/m0sh3rOne/MAPT.git /opt/MAPT
cd /opt/MAPT
sudo ./scripts/install-server-production.sh
```

- **Interface Web & Téléchargement Agent** : `http://<IP_DE_VOTRE_VM>`
- **Guide de déploiement de l'Agent Windows (FOG, GPO, PowerShell)** : Voir [GUIDE_DEPLOIEMENT_AGENT.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_AGENT.md).
- **Guide Serveur Proxmox & Nginx** : Voir [GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md).
- **Mise à jour en production** : Voir [GUIDE_MISE_A_JOUR_MAPT.md](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_MISE_A_JOUR_MAPT.md).

### Option B — Démarrage du Serveur de Test sous WSL2 Ubuntu (Machine de Dev)

#### 1. Initialisation de l'environnement WSL (la première fois)
```bash
cd /mnt/c/Users/Admin/Documents/Github/MAPT
./scripts/setup-wsl-environment.sh
```

#### 2. Démarrage de la stack serveur
```bash
./scripts/start-all.sh
```
- **API REST FastAPI** : [http://localhost:8088/api/v1](http://localhost:8088/api/v1)
- **Documentation Swagger** : [http://localhost:8088/api/v1/docs](http://localhost:8088/api/v1/docs)
- **Console MinIO S3** : [http://localhost:9001](http://localhost:9001)

#### 3. Démarrage de l'Interface Web (Frontend React)
```powershell
cd frontend
npm install
npm run dev
```
- **Accès Web** : [http://localhost:5173](http://localhost:5173)

#### 4. Lancement de l'Agent Windows de Test
```powershell
scripts\run-agent-windows.bat
```
ou directement :
```powershell
cd agent
.\mapt-agent.exe -server "http://localhost:8088/api/v1"
```

### Option C — Téléchargement et Enrôlement de l'Agent Windows sur un poste client

1. **Depuis l'interface Web** : Cliquez sur **"Déployer l'Agent Windows"** dans la barre supérieure.
2. **En ligne de commande PowerShell** sur un poste Windows :
   ```powershell
   # Téléchargement direct depuis le serveur
   Invoke-WebRequest -Uri "http://<IP_SERVEUR>:8088/api/v1/agent/download/windows" -OutFile "mapt-agent.exe"

   # Enrôlement Standalone
   .\mapt-agent.exe -server "http://<IP_SERVEUR>:8088/api/v1" -enroll-token "mapt-enroll-secret-token-2026"

   # Ou installation en Service Windows (démarrage automatique au boot)
   .\mapt-agent.exe -service install -server "http://<IP_SERVEUR>:8088/api/v1" -enroll-token "mapt-enroll-secret-token-2026"
   ```

---

## 7. Structure du Projet

```text
MAPT/
├── backend/                  # API FastAPI, SQLAlchemy 2.0, Workers, MinIO
│   ├── app/
│   │   ├── api/             # Routes REST versionnées (/admin, /agent, /auth)
│   │   ├── core/            # Config, Base de données, Sécurité JWT/RBAC, Sanitizer
│   │   ├── models/          # Modèles SQLAlchemy (Users, Devices, Deployments, Groups, etc.)
│   │   ├── repositories/    # Requêtes et persistance
│   │   ├── schemas/         # Schémas de validation Pydantic v2
│   │   ├── services/        # Logique métier et machine à états
│   │   ├── storage/         # Client MinIO S3
│   │   └── workers/         # Worker asynchrone (Arq)
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Application React 18, TypeScript, Vite, Tailwind CSS
│   ├── src/
│   │   ├── pages/           # Dashboard, Devices, Deployments, Packages, Scripts, Groups, Users, McpServer, Audit
│   │   ├── components/      # Layout, Sidebar, Navbar, Resizable Columns
│   │   ├── hooks/           # useResizableColumns, useSortableTable
│   │   └── services/        # Client Axios intercepté
│   └── package.json
│
├── agent/                    # Agent Windows natif en Go
│   ├── cmd/agent/           # Point d'entrée CLI & Service Windows
│   ├── internal/
│   │   ├── api/             # Client HTTP sécurisé
│   │   ├── download/        # Downloader avec vérification SHA-256
│   │   ├── inventory/       # Collecteur WMI, PowerShell & Réseau
│   │   └── jobs/            # Exécuteurs MSI, PowerShell, Python, CMD
│   └── mapt-agent.exe       # Binaire Windows 64-bit compilé
│
├── mcp/                      # Serveur MCP (Model Context Protocol) pour Assistants IA
│   ├── server.py            # Serveur MCP stdio & HTTP/SSE (15 outils d'administration)
│   └── requirements.txt     # Dépendances Python (mcp, httpx, uvicorn, starlette)
│
├── infrastructure/           # Docker Compose, Nginx, Caddyfile
└── scripts/                  # Scripts d'installation, maintenance et déploiement
```

---

## 8. Documentation & Guides Pratiques

- 📘 [Guide de Déploiement Serveur Proxmox / Production](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_SERVEUR_PROXMOX.md) : Déploiement complet automatisé du serveur MAPT sur une machine virtuelle Ubuntu.
- 🚀 [Guide de Déploiement de l'Agent Windows](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_DEPLOIEMENT_AGENT.md) : Enrôlement manuel, script PowerShell, Service Windows et déploiement FOG Project.
- 👥 [Guide de Gestion des Rôles & Permissions (RBAC)](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_GESTION_ROLES_PERMISSIONS.md) : Détail complet des 5 rôles, assignations de groupes et règles d'isolation Client App Store.
- 🤖 [Guide de Configuration du Serveur MCP](file:///c:/Users/Admin/Documents/Github/MAPT/ConfigMCP.md) : Configuration pour Google Antigravity IDE, Claude Desktop, Cursor et VS Code.
- 📦 [Guide d'Utilisation des Packages & Snapins](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_UTILISATION_PACKAGES_SNAPINS.md) : Création, gestion, arguments d'installation silencieuse et déploiement de logiciels (.MSI, .EXE, .VBS).
- 🔄 [Guide de Mise à Jour MAPT](file:///c:/Users/Admin/Documents/Github/MAPT/GUIDE_MISE_A_JOUR_MAPT.md) : Procédure de mise à jour transparente sans interruption de service.
- 📜 [Documentation d'Architecture](file:///c:/Users/Admin/Documents/Github/MAPT/documentation_architecture_plateforme_deploiement.md) : Spécifications techniques complètes de la plateforme.
