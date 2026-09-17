# Documentation de développement — Plateforme de déploiement et administration de parc

## 1. Objectif du projet

Développer une plateforme client/serveur d'administration de parc informatique, inspirée dans son fonctionnement général d'outils comme WAPT, permettant à un administrateur réseau de :

- Déployer des packages MSI depuis un serveur central.
- Exécuter des scripts PowerShell.
- Exécuter des scripts Python.
- Envoyer des commandes contrôlées aux postes.
- Voir les machines enregistrées.
- Identifier les machines en ligne et hors ligne.
- Organiser les machines en groupes.
- Suivre l'état détaillé des déploiements.
- Consulter les logs d'exécution.
- Consulter un inventaire matériel et système.
- Gérer les utilisateurs et leurs permissions.
- Conserver un journal d'audit des actions administratives.

Le serveur doit fonctionner sur une VM Linux et être administré depuis une interface Web accessible sur le réseau.

---

# 2. Principes d'architecture

## 2.1 Architecture générale

```text
Administrateur
      |
      | HTTPS
      v
Interface Web React
      |
      v
API Backend FastAPI
      |
      +------------------+
      |                  |
      v                  v
 PostgreSQL            Redis
      |                  |
      |                  v
      |               Workers
      |
      v
 Métadonnées

      API Backend
           ^
           | HTTPS / TLS
           |
           v
    Agent Windows
           |
           +---------------------+
           |                     |
           v                     v
       MSI Installer      Script Executors
                           PowerShell
                           Python
```

Les packages et éventuels fichiers volumineux sont stockés dans un stockage compatible S3, par exemple MinIO.

---

# 3. Stack technique imposée

## Backend

- Python 3.12+
- FastAPI
- SQLAlchemy 2.x
- Pydantic
- Alembic
- PostgreSQL
- Redis
- Arq ou autre système de workers asynchrones compatible Python

## Frontend

- React
- TypeScript
- Vite
- TanStack Query
- Tailwind CSS
- Bibliothèque de composants cohérente

## Agent Windows

- Go
- Service Windows
- HTTP client natif
- Logs structurés
- Exécution de processus Windows

## Infrastructure

- Linux (Debian ou Ubuntu Server)
- Docker Compose
- PostgreSQL
- Redis
- MinIO
- Caddy ou Nginx comme reverse proxy

---

# 4. Architecture réseau

Le serveur ne doit pas initier de connexion directe vers les postes clients.

Le modèle doit être de type Pull :

```text
Agent Windows
    |
    | HTTPS
    v
Serveur
```

L'agent contacte régulièrement le serveur pour :

1. Envoyer un heartbeat.
2. Mettre à jour son inventaire.
3. Demander les jobs disponibles.
4. Accuser réception d'un job.
5. Envoyer la progression.
6. Envoyer les logs.
7. Envoyer le résultat final.

Intervalle initial recommandé :

- Heartbeat : toutes les 30 secondes.
- Recherche de jobs : toutes les 30 secondes ou immédiatement après le heartbeat.
- Inventaire système : toutes les heures.
- Inventaire des logiciels installés : toutes les 24 heures.

Ces valeurs doivent être configurables côté serveur.

---

# 5. Architecture du monorepo

```text
network-manager/
|
├── backend/
│
├── frontend/
│
├── agent/
│
├── infrastructure/
│
├── docs/
│
├── scripts/
│
├── docker-compose.yml
│
└── README.md
```

---

# 6. Backend

## Structure recommandée

```text
backend/
|
├── app/
│   |
│   ├── main.py
│   |
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── security.py
│   │   └── logging.py
│   |
│   ├── api/
│   │   |
│   │   ├── router.py
│   │   |
│   │   ├── auth/
│   │   │   └── routes.py
│   │   |
│   │   ├── admin/
│   │   │   ├── devices.py
│   │   │   ├── groups.py
│   │   │   ├── packages.py
│   │   │   ├── scripts.py
│   │   │   ├── deployments.py
│   │   │   └── users.py
│   │   |
│   │   └── agent/
│   │       ├── enroll.py
│   │       ├── heartbeat.py
│   │       ├── jobs.py
│   │       └── inventory.py
│   |
│   ├── models/
│   │   ├── user.py
│   │   ├── device.py
│   │   ├── group.py
│   │   ├── package.py
│   │   ├── script.py
│   │   ├── deployment.py
│   │   ├── job.py
│   │   └── audit.py
│   |
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── device.py
│   │   ├── group.py
│   │   ├── package.py
│   │   ├── script.py
│   │   ├── deployment.py
│   │   └── agent.py
│   |
│   ├── repositories/
│   │   ├── device_repository.py
│   │   ├── deployment_repository.py
│   │   ├── package_repository.py
│   │   └── script_repository.py
│   |
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── device_service.py
│   │   ├── group_service.py
│   │   ├── package_service.py
│   │   ├── script_service.py
│   │   ├── deployment_service.py
│   │   └── job_service.py
│   |
│   ├── workers/
│   │   ├── deployment_worker.py
│   │   ├── cleanup_worker.py
│   │   └── inventory_worker.py
│   |
│   └── storage/
│       └── minio.py
│
├── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── api/
│
├── pyproject.toml
├── Dockerfile
└── README.md
```

---

# 7. Base de données

## 7.1 Users

```text
users
```

Champs principaux :

- id UUID PK
- username
- email
- password_hash
- role
- is_active
- created_at
- updated_at
- last_login_at

Rôles initiaux :

```text
viewer
operator
administrator
super_admin
```

---

## 7.2 Devices

```text
devices
```

Champs :

- id UUID PK
- device_uuid UUID UNIQUE
- hostname
- os_name
- os_version
- os_build
- agent_version
- ip_address
- enabled
- last_seen_at
- created_at
- updated_at

Le statut online/offline doit être principalement calculé à partir de `last_seen_at`.

Exemple :

```text
ONLINE si NOW - last_seen_at < seuil configurable
OFFLINE sinon
```

---

## 7.3 Device groups

```text
device_groups
```

Champs :

- id
- name
- description
- created_at

Table de relation :

```text
device_group_members
```

Champs :

- device_id
- group_id

---

## 7.4 Device inventory

```text
device_inventory
```

Champs :

- device_id
- cpu_model
- cpu_cores
- total_memory_mb
- disk_total_gb
- disk_free_gb
- mac_addresses JSONB
- network_interfaces JSONB
- current_user
- last_boot_at
- updated_at

---

## 7.5 Packages

### packages

Champs :

- id
- name
- description
- package_type
- created_by
- created_at
- archived

Types initiaux :

```text
msi
exe
zip
```

### package_versions

Champs :

- id
- package_id
- version
- filename
- storage_key
- sha256
- size_bytes
- install_command
- uninstall_command
- created_at

Une version de package utilisée dans un déploiement doit rester immuable.

---

## 7.6 Scripts

### scripts

Champs :

- id
- name
- description
- language
- created_by
- created_at
- archived

Langages initiaux :

```text
powershell
python
cmd
```

### script_versions

Champs :

- id
- script_id
- version
- content
- sha256
- timeout_seconds
- created_by
- created_at

Une modification doit créer une nouvelle version.

Ne jamais modifier le contenu d'une version déjà déployée.

---

# 8. Déploiements et Jobs

## 8.1 Concept

Un déploiement est une action logique créée par un administrateur.

Exemple :

```text
Déploiement :
Installation de 7-Zip
```

Le système génère ensuite une exécution indépendante pour chaque machine ciblée.

```text
Deployment
    |
    +-- Target PC-001
    |
    +-- Target PC-002
    |
    +-- Target PC-003
```

Chaque cible possède son propre état et ses propres logs.

---

## 8.2 deployments

Champs :

- id
- name
- description
- deployment_type
- package_version_id nullable
- script_version_id nullable
- created_by
- status
- scheduled_at
- created_at
- started_at
- completed_at

Types :

```text
package
script
command
```

---

## 8.3 deployment_targets

Champs :

- id
- deployment_id
- device_id
- status
- retry_count
- max_retries
- created_at
- offered_at
- acknowledged_at
- started_at
- completed_at
- exit_code
- error_message

Machine à états recommandée :

```text
PENDING
   |
   v
OFFERED
   |
   v
ACKED
   |
   v
RUNNING
   |
   +---------> SUCCEEDED
   |
   +---------> FAILED
   |
   +---------> TIMED_OUT
   |
   +---------> CANCELLED
```

Les transitions doivent être validées côté serveur.

---

## 8.4 job_logs

Champs :

- id
- deployment_target_id
- timestamp
- level
- message

Niveaux :

```text
DEBUG
INFO
WARNING
ERROR
```

---

# 9. Idempotence et robustesse

L'agent peut perdre sa connexion ou redémarrer.

Le protocole doit donc être idempotent.

Chaque job doit posséder :

```text
job_id
```

L'agent doit conserver localement les informations nécessaires pour savoir :

- quel job a été téléchargé ;
- quel job est en cours ;
- quel job est terminé ;
- quel résultat doit éventuellement être renvoyé.

Le serveur doit accepter la répétition d'un message de progression ou de résultat sans créer d'incohérence.

---

# 10. API REST

Toutes les API doivent être versionnées.

Base recommandée :

```text
/api/v1
```

Deux zones distinctes :

```text
/api/v1/admin/*
/api/v1/agent/*
```

---

# 11. API Authentification

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Les administrateurs utilisent un mécanisme de tokens sécurisé.

Les agents utilisent un mécanisme distinct.

---

# 12. API Administrateur — Devices

```text
GET    /api/v1/admin/devices
GET    /api/v1/admin/devices/{device_id}
GET    /api/v1/admin/devices/{device_id}/inventory
GET    /api/v1/admin/devices/{device_id}/jobs
GET    /api/v1/admin/devices/{device_id}/logs

POST   /api/v1/admin/devices/{device_id}/disable
POST   /api/v1/admin/devices/{device_id}/enable

DELETE /api/v1/admin/devices/{device_id}
```

La suppression doit de préférence être un soft delete.

---

# 13. API Administrateur — Groups

```text
GET    /api/v1/admin/groups
POST   /api/v1/admin/groups

GET    /api/v1/admin/groups/{group_id}
PUT    /api/v1/admin/groups/{group_id}
DELETE /api/v1/admin/groups/{group_id}

POST   /api/v1/admin/groups/{group_id}/devices
DELETE /api/v1/admin/groups/{group_id}/devices/{device_id}
```

---

# 14. API Administrateur — Packages

```text
GET    /api/v1/admin/packages
POST   /api/v1/admin/packages

GET    /api/v1/admin/packages/{package_id}
PUT    /api/v1/admin/packages/{package_id}

GET    /api/v1/admin/packages/{package_id}/versions

POST   /api/v1/admin/packages/{package_id}/versions
```

L'upload doit utiliser :

```text
multipart/form-data
```

Après upload :

1. Calculer SHA-256.
2. Stocker le fichier.
3. Créer la version.
4. Conserver la taille.
5. Rendre la version immuable.

---

# 15. API Administrateur — Scripts

```text
GET  /api/v1/admin/scripts
POST /api/v1/admin/scripts

GET  /api/v1/admin/scripts/{script_id}
PUT  /api/v1/admin/scripts/{script_id}

GET  /api/v1/admin/scripts/{script_id}/versions
POST /api/v1/admin/scripts/{script_id}/versions
```

Créer une nouvelle version pour toute modification du contenu.

---

# 16. API Administrateur — Deployments

```text
GET  /api/v1/admin/deployments
POST /api/v1/admin/deployments

GET  /api/v1/admin/deployments/{deployment_id}

GET  /api/v1/admin/deployments/{deployment_id}/status

GET  /api/v1/admin/deployments/{deployment_id}/targets

POST /api/v1/admin/deployments/{deployment_id}/cancel

POST /api/v1/admin/deployments/{deployment_id}/targets/{target_id}/retry
```

---

# 17. API Agent

## Enrollment

```text
POST /api/v1/agent/enroll
```

L'installation de l'agent doit recevoir un token d'enrôlement.

Le serveur doit :

1. Vérifier le token.
2. Créer ou mettre à jour le device.
3. Associer une identité unique à l'agent.
4. Retourner les paramètres nécessaires.

À terme, remplacer ou compléter le token par mTLS.

---

## Heartbeat

```text
POST /api/v1/agent/heartbeat
```

L'agent envoie :

- device_id
- agent_version
- timestamp
- informations d'état

Le serveur met à jour :

```text
last_seen_at
```

Le serveur peut retourner :

- poll_interval
- inventory_interval
- configuration agent

---

## Récupération des jobs

```text
GET /api/v1/agent/jobs
```

Le serveur retourne uniquement les jobs destinés à cet agent.

Un job doit contenir :

```json
{
  "id": "uuid",
  "type": "package",
  "payload": {}
}
```

Types initiaux :

```text
package
powershell
python
command
```

---

## ACK

```text
POST /api/v1/agent/jobs/{job_id}/ack
```

Transition :

```text
OFFERED -> ACKED
```

---

## Progression

```text
POST /api/v1/agent/jobs/{job_id}/progress
```

Exemple :

```json
{
  "status": "RUNNING",
  "progress": 50,
  "message": "Installation en cours"
}
```

---

## Logs

```text
POST /api/v1/agent/jobs/{job_id}/logs
```

Les logs doivent être envoyés par lots.

---

## Completion

```text
POST /api/v1/agent/jobs/{job_id}/complete
```

Exemple :

```json
{
  "status": "SUCCEEDED",
  "exit_code": 0,
  "duration_seconds": 42
}
```

---

## Failure

```text
POST /api/v1/agent/jobs/{job_id}/fail
```

Exemple :

```json
{
  "status": "FAILED",
  "exit_code": 1603,
  "error": "MSI installation failed"
}
```

---

## Inventory

```text
POST /api/v1/agent/inventory
```

---

# 18. Format recommandé des commandes

Éviter autant que possible :

```text
cmd.exe /c command arg1 arg2
```

comme format interne principal.

Préférer une représentation structurée :

```json
{
  "executable": "msiexec.exe",
  "arguments": [
    "/i",
    "package.msi",
    "/qn",
    "/norestart"
  ]
}
```

Cela évite les problèmes d'échappement et améliore le contrôle des arguments.

---

# 19. Agent Windows

## Structure

```text
agent/
|
├── cmd/
│   └── agent/
│       └── main.go
│
├── internal/
│   |
│   ├── config/
│   │   └── config.go
│   |
│   ├── service/
│   │   ├── windows.go
│   │   └── runner.go
│   |
│   ├── api/
│   │   ├── client.go
│   │   ├── enroll.go
│   │   ├── heartbeat.go
│   │   ├── jobs.go
│   │   └── inventory.go
│   |
│   ├── jobs/
│   │   ├── executor.go
│   │   ├── package.go
│   │   ├── powershell.go
│   │   ├── python.go
│   │   └── command.go
│   |
│   ├── download/
│   │   ├── downloader.go
│   │   └── checksum.go
│   |
│   ├── inventory/
│   │   ├── hardware.go
│   │   ├── network.go
│   │   └── software.go
│   |
│   ├── logging/
│   │   └── logger.go
│   |
│   └── security/
│       ├── token.go
│       └── certificates.go
│
├── tests/
│
├── go.mod
└── go.sum
```

---

# 20. Cycle de vie de l'agent

```text
START
  |
  v
Load configuration
  |
  v
Is enrolled?
  |
  +-- NO --> Enrollment
  |
  v
Heartbeat
  |
  v
Request jobs
  |
  +-- No job --> Sleep
  |
  v
ACK job
  |
  v
Download resources
  |
  v
Verify SHA-256
  |
  v
Execute job
  |
  +--> MSI
  |
  +--> PowerShell
  |
  +--> Python
  |
  +--> Command
  |
  v
Send logs
  |
  v
Send final result
  |
  v
Repeat
```

---

# 21. Exécution MSI

Processus :

```text
Receive Job
    |
    v
Download MSI
    |
    v
Verify SHA-256
    |
    v
Store in temporary directory
    |
    v
Run msiexec.exe
    |
    v
Capture exit code
    |
    v
Upload logs
    |
    v
Report result
```

Commande typique :

```text
msiexec.exe /i package.msi /qn /norestart
```

La commande exacte doit être définie par les métadonnées du package.

---

# 22. Exécution PowerShell

Le script doit être téléchargé ou transmis dans le payload selon la taille.

Exécution recommandée :

```text
powershell.exe
-NoProfile
-NonInteractive
-File script.ps1
```

Prévoir :

- timeout ;
- capture stdout ;
- capture stderr ;
- exit code ;
- logs structurés.

Les scripts doivent être versionnés.

---

# 23. Exécution Python

Deux options possibles.

## MVP

Python installé ou embarqué avec l'environnement de l'agent.

## Version avancée

Les scripts Python peuvent utiliser un bundle avec :

```text
script.py
requirements.txt
dependencies/
```

Ne pas télécharger automatiquement des dépendances depuis Internet sans contrôle explicite.

Préférer un dépôt interne ou des dépendances fournies avec le bundle.

---

# 24. Frontend

## Structure

```text
frontend/
|
├── src/
│   |
│   ├── app/
│   │   ├── router.tsx
│   │   └── providers.tsx
│   |
│   ├── pages/
│   │   ├── Dashboard/
│   │   ├── Devices/
│   │   ├── DeviceDetail/
│   │   ├── Deployments/
│   │   ├── DeploymentDetail/
│   │   ├── Packages/
│   │   ├── Scripts/
│   │   ├── Groups/
│   │   └── Settings/
│   |
│   ├── components/
│   │   ├── common/
│   │   ├── devices/
│   │   ├── deployments/
│   │   ├── packages/
│   │   └── scripts/
│   |
│   ├── services/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── devices.ts
│   │   ├── deployments.ts
│   │   ├── packages.ts
│   │   └── scripts.ts
│   |
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── main.tsx
│
├── package.json
├── vite.config.ts
└── Dockerfile
```

---

# 25. Pages à développer

## Dashboard

Afficher :

- nombre total de machines ;
- machines online ;
- machines offline ;
- déploiements actifs ;
- jobs en erreur ;
- derniers déploiements.

---

## Devices

Table avec :

- hostname ;
- IP ;
- système ;
- version de l'agent ;
- dernier heartbeat ;
- statut.

---

## Device Detail

Onglets :

```text
General
Inventory
Groups
Jobs
Logs
```

---

## Deployments

Afficher :

- nom ;
- type ;
- date ;
- créateur ;
- progression ;
- succès ;
- erreurs.

---

## Deployment Detail

Afficher chaque cible individuellement :

```text
PC-001   SUCCESS
PC-002   RUNNING
PC-003   FAILED
PC-004   PENDING
```

Avec accès aux logs.

---

## Packages

Permettre :

- création ;
- upload ;
- gestion des versions ;
- archivage.

---

## Scripts

Permettre :

- création ;
- édition ;
- création de version ;
- consultation historique.

---

# 26. Sécurité

Ce produit permet l'exécution distante de code.

La sécurité est une exigence fonctionnelle majeure.

## Obligatoire

- HTTPS.
- Authentification séparée admin/agent.
- Tokens d'enrôlement avec expiration.
- SHA-256 des packages.
- RBAC.
- Audit logs.
- Validation stricte des transitions de jobs.
- Validation stricte des payloads.
- Timeout des processus.
- Limites de taille des fichiers et logs.

## Version avancée

- mTLS pour les agents.
- Signature cryptographique des packages.
- Signature cryptographique des scripts.
- Révocation des identités d'agents.
- Rotation des certificats.
- 2FA pour les administrateurs.

---

# 27. Audit

Toute action administrative importante doit créer un événement d'audit.

Exemples :

```text
USER_LOGIN
PACKAGE_CREATED
PACKAGE_VERSION_UPLOADED
SCRIPT_CREATED
SCRIPT_VERSION_CREATED
DEPLOYMENT_CREATED
DEPLOYMENT_CANCELLED
DEVICE_DISABLED
DEVICE_ENABLED
USER_CREATED
ROLE_CHANGED
```

---

# 28. Infrastructure

Structure :

```text
infrastructure/
|
├── caddy/
│   └── Caddyfile
|
├── postgres/
|
├── redis/
|
├── minio/
|
├── monitoring/
│   ├── prometheus/
│   ├── grafana/
│   └── loki/
|
└── docker/
```

Services Docker initiaux :

```text
proxy
frontend
backend
worker
postgres
redis
minio
```

---

# 29. Tests

## Backend

Tests :

```text
unit
integration
api
```

Tester en priorité :

- authentification ;
- permissions ;
- transitions de jobs ;
- création de déploiements ;
- idempotence ;
- validation des agents.

---

## Agent

Tester :

- téléchargement ;
- SHA-256 ;
- reprise après erreur ;
- timeout ;
- remontée des résultats ;
- exécution de jobs simulés.

---

# 30. Priorités de développement

## Phase 1 — Fondation

- Docker Compose.
- PostgreSQL.
- FastAPI.
- Modèles de base.
- Migration Alembic.
- Authentification.
- React.
- Page Dashboard vide.

## Phase 2 — Agents

- Service Windows.
- Enrollment.
- Device UUID.
- Heartbeat.
- Liste des machines.

## Phase 3 — Job Engine

- Deployments.
- Deployment targets.
- Polling.
- ACK.
- Progression.
- Completion.
- Logs.

## Phase 4 — Scripts

- PowerShell.
- stdout/stderr.
- timeout.
- exit code.
- versioning.

## Phase 5 — Packages

- Upload MSI.
- MinIO.
- SHA-256.
- Download.
- msiexec.
- logs.

## Phase 6 — Interface complète

- Groups.
- Bulk targeting.
- Dashboard.
- Deployment progress.
- Retry.
- Cancel.

## Phase 7 — Sécurité avancée

- RBAC complet.
- Audit.
- Tokens d'enrollment.
- mTLS.
- Signature des scripts et packages.

---

# 31. Règles importantes pour l'Agent IA de développement

L'Agent IA doit respecter les règles suivantes :

1. Ne pas mélanger l'API administrateur et l'API agent.
2. Utiliser des UUID pour toutes les ressources principales.
3. Versionner les API avec `/api/v1`.
4. Toute modification d'un script doit créer une nouvelle version.
5. Toute version de package utilisée doit être immuable.
6. Chaque machine ciblée doit posséder son propre état de job.
7. Ne jamais considérer un job global comme réussi si certaines cibles ont échoué.
8. Gérer explicitement les timeouts.
9. Gérer les redémarrages et pertes de connexion des agents.
10. Concevoir toutes les opérations agent pour être idempotentes.
11. Vérifier l'intégrité des packages avant exécution.
12. Enregistrer les actions administratives importantes dans l'audit log.
13. Ne jamais exposer les secrets ou tokens dans les logs.
14. Utiliser des payloads JSON validés.
15. Utiliser une machine à états stricte pour les jobs.
16. Écrire des tests pour les transitions critiques.
17. Ne pas ajouter de fonctionnalités hors du périmètre MVP sans isoler clairement les extensions.

---

# 32. Objectif MVP

Le MVP est considéré comme fonctionnel lorsque :

1. Le serveur peut être démarré avec Docker Compose.
2. Un administrateur peut se connecter à l'interface Web.
3. Un agent Windows peut être installé et enrôlé.
4. L'agent apparaît dans la liste des machines.
5. Le statut online/offline est visible.
6. Un script PowerShell peut être créé et déployé.
7. Le résultat du script est remonté.
8. Les logs sont consultables.
9. Un MSI peut être uploadé.
10. Le MSI peut être déployé sur plusieurs machines.
11. Chaque machine possède un statut indépendant.
12. Les erreurs sont visibles.
13. Un job peut être relancé sur une machine en erreur.
14. Les actions administratives principales sont auditables.

---

# 33. Architecture finale

```text
                     WEB ADMIN
                 React + TypeScript
                         |
                         v
                    HTTPS / TLS
                         |
                         v
                 Reverse Proxy
                         |
                         v
                    FastAPI API
                         |
           +-------------+-------------+
           |             |             |
           v             v             v
      PostgreSQL       Redis         MinIO
           |             |
           |             v
           |          Workers
           |
           +-----------------------------+
                                         |
                                    HTTPS / TLS
                                         |
                                         v
                                  Windows Agent
                                      Go
                                         |
                     +-------------------+------------------+
                     |                   |                  |
                     v                   v                  v
                   MSI              PowerShell            Python
```

---

# 34. Décision d'architecture principale

Le coeur du système doit être conçu autour du modèle :

```text
DEPLOYMENT
    |
    v
DEPLOYMENT TARGET
    |
    v
JOB STATE MACHINE
    |
    +--> PENDING
    +--> OFFERED
    +--> ACKED
    +--> RUNNING
    +--> SUCCEEDED
    +--> FAILED
    +--> TIMED_OUT
    +--> CANCELLED
```

L'implémentation doit privilégier :

- robustesse ;
- traçabilité ;
- idempotence ;
- sécurité ;
- extensibilité.

Les nouvelles fonctionnalités futures doivent pouvoir être ajoutées comme de nouveaux types de jobs sans nécessiter une refonte de l'architecture principale.
