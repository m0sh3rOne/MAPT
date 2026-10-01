# Guide de Déploiement du Serveur MAPT sur VM Ubuntu (Proxmox VE / KVM / LXC)

Ce guide décrit l'installation pas-à-pas et automatisée de la plateforme **MAPT (Modular Automated Provisioning & Tracking)** sur une machine virtuelle Ubuntu dédiée (ou conteneur LXC) hébergée sur votre infrastructure **Proxmox VE**.

---

## 1. Prérequis sur Proxmox VE

### Spécifications recommandées pour la VM / LXC
- **OS** : Ubuntu Server 22.04 LTS ou 24.04 LTS (x64)
- **CPU** : 2 vCPU
- **RAM** : 2 Go minimum (4 Go recommandés)
- **Disque** : 20 Go à 50 Go (selon le volume de packages MSI/EXE stockés dans MinIO)
- **Réseau** : IP statique ou bail DHCP fixe sur votre réseau local (ex: `192.168.1.150`)

---

## 2. Déploiement en 1 Ligne (Recommandé avec Docker Compose)

Connectez-vous en SSH à votre machine virtuelle Ubuntu :

```bash
ssh utilisateur@<IP_VM_PROXMOX>
```

### Étape A — Cloner ou copier le dépôt MAPT sur la VM

```bash
sudo mkdir -p /opt/MAPT
sudo chown $USER:$USER /opt/MAPT
git clone https://github.com/m0sh3rOne/MAPT.git /opt/MAPT
cd /opt/MAPT
```

### Étape B — Lancer l'installation automatisée

Exécutez le script d'installation avec les droits `sudo` :

```bash
sudo ./scripts/install-server-production.sh
```

#### 🧙 Assistant Interactif de Configuration
Lors de l'exécution, le script vous demandera interactivement de renseigner :
1. **Nom d'utilisateur Administrateur** (ex: `admin` ou votre identifiant)
2. **Adresse Email Administrateur** (ex: `admin@votre-domaine.local`)
3. **Mot de passe Administrateur** (saisie sécurisée masquée avec confirmation)
4. **Passphrase de Sécurité / Jeton d'Enrôlement (`$enrollToken`)** :
   - Secret partagé (PSK) permettant aux nouveaux agents de s'enregistrer.
   - Vous pouvez accepter la valeur aléatoire sécurisée proposée par défaut ou saisir votre propre passphrase personnalisée.

Le script configure automatiquement :
- La génération d'une clé secrète JWT cryptographique de 256 bits (`SECRET_KEY`).
- L'enregistrement sécurisé des variables dans `infrastructure/.env` (permissions restreintes `0600`).
- L'installation de Docker Engine et du plugin Docker Compose si absents.
- L'installation de Go et la compilation native du binaire client **`mapt-agent.exe`** pour Windows.
- La création et le lancement des 6 conteneurs isolés :
   - **Base de données relationnelle** : PostgreSQL 16
   - **Broker de messages & cache** : Redis 7
   - **Stockage d'objets S3** : MinIO
   - **API REST & Télémétrie** : FastAPI Backend (Port 8000 interne)
   - **Background Worker** : Surveillance des jobs & timeouts
   - **Interface Web & Reverse Proxy** : Nginx + React 18 (Port 80 externe)

---

## 3. Accès à l'Interface Web et Téléchargement de l'Agent

Une fois le script terminé, accédez à l'interface depuis n'importe quel navigateur de votre réseau :

- **Interface Web MAPT** : `http://<IP_DE_VOTRE_VM>` (ex: `http://192.168.1.150`)
- **Console de Stockage MinIO** : `http://<IP_DE_VOTRE_VM>:9001`
- **Swagger API Docs** : `http://<IP_DE_VOTRE_VM>/api/v1/docs`

### Identifiants Administrateur
- **Nom d'utilisateur** : défini lors de l'assistant interactif (défaut: `admin`)
- **Mot de passe** : défini lors de l'assistant interactif

---

## 4. Téléchargement et Déploiement de l'Agent Windows

### Méthode 1 — Depuis l'Interface Web MAPT (Recommandé)
1. Connectez-vous sur `http://<IP_DE_VOTRE_VM>`.
2. Cliquez sur le bouton vert en haut à droite **"Télécharger l'Agent Windows"** (ou sur la page **Parc Machines**).
3. Téléchargez directement le fichier **`mapt-agent.exe`**.
4. La fenêtre modale vous affiche la commande pré-remplie avec l'adresse IP de votre serveur et votre `$enrollToken`.

### Méthode 2 — Téléchargement rapide en PowerShell sur le poste Windows
Sur n'importe quel poste Windows du réseau, ouvrez un terminal PowerShell en Administrateur :

```powershell
# 1. Téléchargement du binaire depuis votre serveur MAPT
Invoke-WebRequest -Uri "http://<IP_DE_VOTRE_VM>/api/v1/agent/download/windows" -OutFile "mapt-agent.exe"

# 2. Test immédiat d'enrôlement (Mode Standalone)
.\mapt-agent.exe -server "http://<IP_DE_VOTRE_VM>/api/v1" -enroll-token "<VOTRE_ENROLL_TOKEN>"
```

### Méthode 3 — Installation en tant que Service Windows (Démarrage au boot)
Pour que l'agent fonctionne en continu en arrière-plan sur les machines des utilisateurs :

```powershell
# Exécuter dans un PowerShell en Administrateur
.\mapt-agent.exe -service install -server "http://<IP_DE_VOTRE_VM>/api/v1" -enroll-token "<VOTRE_ENROLL_TOKEN>"
.\mapt-agent.exe -service start
```

---

### Configuration et Sécurité du Jeton d'Enrôlement (`$enrollToken`)

Le **Jeton d'enrôlement** (`enrollment_token`) est un secret partagé (Pre-Shared Key / PSK) qui sécurise l'enregistrement des nouveaux postes clients sur votre serveur MAPT.

#### 1. Comment fonctionne la sécurité de l'enrôlement ?
- **Filtrage initial** : Le jeton d'enrôlement n'est utilisé **qu'une seule fois**, lors du tout premier contact de la machine avec le serveur (`POST /api/v1/agent/enroll`). Il empêche des machines inconnues ou non autorisées de s'enregistrer dans votre parc.
- **Délivrance d'un jeton unique** : Dès que le serveur valide le jeton d'enrôlement, il génère un identifiant cryptographique aléatoire de 256 bits (`agent_token`) strictement dédié à ce PC.
- **Persistance** : L'Agent enregistre son `agent_token` localement dans son fichier de configuration. Pour toutes les actions ultérieures (Heartbeats, inventaire WMI, exécution de scripts et déploiements), l'agent n'utilise plus le jeton d'enrôlement mais son propre `agent_token`.

#### 2. Modifier le Jeton d'Enrôlement ultérieurement sur votre Serveur
Si vous souhaitez changer votre jeton après l'installation initiale :

1. Sur votre VM Ubuntu Proxmox, éditez le fichier d'environnement :
   ```bash
   nano /opt/MAPT/infrastructure/.env
   ```
2. Modifiez la variable `DEFAULT_ENROLLMENT_TOKEN` :
   ```bash
   DEFAULT_ENROLLMENT_TOKEN=MonNouveauSecret2026!
   ```
3. Appliquez le changement en redémarrant les conteneurs :
   ```bash
   cd /opt/MAPT/infrastructure
   docker compose up -d
   ```
4. Utilisez ce nouveau jeton dans vos commandes d'installation et dans votre Snapin FOG :
   ```text
   -enroll-token "MonNouveauSecret2026!"
   ```

---

## 5. Déploiement Automatisé de l'Agent via FOG Project (Snapin FOG)

Vous pouvez déployer et enrôler automatiquement l'Agent MAPT sur tout votre parc de machines après le clonage ou à distance en utilisant le système de **Snapins de FOG Project**.

### Option A — Snapin FOG Direct (Binaire EXE)

1. Rendez-vous sur votre interface web **FOG Management Console** (`http://<IP_SERVEUR_FOG>/fog`).
2. Allez dans **Snapins** &rarr; **Create New Snapin**.
3. Renseignez les paramètres suivants :

| Champ FOG | Valeur à renseigner | Description |
| :--- | :--- | :--- |
| **Snapin Name** | `MAPT - Agent Windows Enrollement` | Nom affiché dans FOG |
| **Snapin File** | `mapt-agent.exe` | Uploader le binaire téléchargé depuis MAPT |
| **Snapin Run With** | *(Laisser vide)* | Exécution directe du binaire |
| **Snapin Run With Arguments** | *(Laisser vide)* | Aucun |
| **Snapin Arguments** | `-service install -server "http://<IP_DE_VOTRE_VM>/api/v1" -enroll-token "mapt-enroll-secret-token-2026"` | Installe et démarre le service Windows |
| **Reboot After Snapin** | `Non` / Décoché | Aucun redémarrage requis |

4. Cliquez sur **Add**.

---

### Option B — Snapin FOG via Script PowerShell Autonome (Zero-Upload)

Cette méthode ne nécessite même pas d'uploader le binaire dans FOG : le script télécharge la dernière version de l'agent directement depuis votre serveur MAPT et l'installe sous `C:\Program Files\MAPT`.

1. Créez un fichier `deploy-mapt-agent.ps1` :

```powershell
# Script de déploiement FOG Snapin - MAPT Agent
$ErrorActionPreference = "Stop"
$serverUrl = "http://<IP_DE_VOTRE_VM>/api/v1"
$enrollToken = "mapt-enroll-secret-token-2026"
$installDir = "$env:ProgramFiles\MAPT"

# 1. Création du répertoire cible
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# 2. Téléchargement de la dernière version de l'agent
$agentExe = "$installDir\mapt-agent.exe"
Invoke-WebRequest -Uri "$serverUrl/agent/download/windows" -OutFile $agentExe -UseBasicParsing

# 3. Installation et démarrage du service Windows (NT AUTHORITY\SYSTEM)
Start-Process -FilePath $agentExe -ArgumentList "-service install -server `"$serverUrl`" -enroll-token `"$enrollToken`"" -Wait -NoNewWindow
Start-Process -FilePath $agentExe -ArgumentList "-service start" -Wait -NoNewWindow

Write-Output "[OK] Agent MAPT déployé et enrôlé avec succès !"
```

2. Dans FOG :
   - **Snapin Run With** : `powershell.exe`
   - **Snapin Run With Arguments** : `-ExecutionPolicy Bypass -NoProfile -File`
   - **Snapin File** : `deploy-mapt-agent.ps1`

---

### Déclenchement du Déploiement FOG

- **Sur une seule machine** : Dans FOG, allez sur l'hôte &rarr; onglet **Basic Tasks** &rarr; **Advanced** &rarr; **Single Snapin** &rarr; Choisissez `MAPT - Agent Windows Enrollement`.
- **Sur tout le parc ou un groupe** : Dans FOG, allez dans **Groups** &rarr; Sélectionnez votre groupe de PC &rarr; onglet **Basic Tasks** &rarr; **Advanced** &rarr; **Single Snapin**.
- **Automatique post-clonage** : Associez le Snapin à votre groupe d'hôtes pour qu'il s'exécute automatiquement dès la fin de la descente d'image FOG.

Dès que le FOG Client exécute le snapin, la machine apparaît instantanément dans l'onglet **Parc Machines** de MAPT avec son inventaire complet.

---

## 6. Gestion et Maintenance du Serveur

### Voir les logs des services
```bash
cd /opt/MAPT/infrastructure
docker compose logs -f backend
docker compose logs -f worker
```

### Redémarrer ou mettre à jour la stack
```bash
cd /opt/MAPT/infrastructure
docker compose restart
```

### Sauvegarde de la base de données PostgreSQL
```bash
docker exec -t mapt-postgres pg_dump -U mapt mapt > backup_mapt_$(date +%F).sql
```

---

## 7. Dépannage & Résolution des Erreurs Communes (FAQ / Troubleshooting)

Ce document recense les erreurs communes rencontrées lors du déploiement du projet (clonage Git, configuration SSH, droits d'accès, et exécution de scripts) sur une machine virtuelle Ubuntu, ainsi que leurs résolutions.

---

### 1. Génération et ajout des clés SSH (Agent SSH)

**Symptômes / Erreurs :**
> `/home/user/.ssh/id_ed25519: No such file or directory`  
> `/root/.ssh/id_ed25519: Permission denied`  
> `Could not open a connection to your authentication agent.`

**Cause :** 
Générer une clé SSH avec `sudo` la place dans le dossier `/root`, la rendant inaccessible à l'utilisateur standard. L'utilisation de `sudo ssh-add` échoue car la commande `sudo` s'exécute dans un environnement isolé qui perd la variable d'environnement de l'agent SSH préalablement démarré.

**Solution :**
Toujours générer et configurer ses clés SSH en tant qu'utilisateur standard (sans `sudo`).

```bash
# 1. Générer la clé (appuyer sur Entrée pour les options par défaut)
ssh-keygen -t ed25519 -C "votre_email@example.com"

# 2. Démarrer l'agent SSH
eval "$(ssh-agent -s)"

# 3. Ajouter la clé à l'agent
ssh-add ~/.ssh/id_ed25519
```

---

### 2. Clonage Git dans des répertoires restreints

**Symptôme / Erreur :**
> `fatal: could not create work tree dir '/opt/MAPT': Permission denied`

**Cause :**
Un utilisateur standard n'a pas les droits pour créer des dossiers dans des répertoires système protégés comme `/opt/` ou à la racine de `/home/`.

**Solution :**
Créer le dossier cible avec les droits administrateur, puis en transférer la propriété (propriétaire et groupe) à l'utilisateur standard avant de lancer la commande `git clone`.

```bash
# 1. Créer le dossier
sudo mkdir -p /opt/MAPT

# 2. Donner la propriété à l'utilisateur
sudo chown $USER:$USER /opt/MAPT

# 3. Cloner le dépôt (utiliser l'URL SSH de préférence)
git clone git@github.com:m0sh3rOne/MAPT.git /opt/MAPT
```

---

### 3. Échec du clonage HTTPS derrière un pare-feu / proxy

**Symptôme / Erreur :**
> `fatal: unable to access 'https://github.com/...': gnutls_handshake() failed: A packet with illegal or unsupported version was received.`

**Cause :**
Lors d'un clonage via `https://`, le proxy du réseau (fréquent en milieu scolaire ou d'entreprise) intercepte la connexion SSL/TLS. La bibliothèque de sécurité d'Ubuntu rejette le certificat du proxy et coupe la connexion.

**Solution 1 (Recommandée) :**
Utiliser l'URL SSH (`git@github.com:...`) au lieu de l'URL HTTPS. Le protocole SSH est souvent moins impacté par l'inspection TLS du réseau.

**Solution 2 (Contournement Proxy HTTPS) :**
Déclarer le proxy dans Git et désactiver temporairement la vérification SSL :

```bash
git config --global http.proxy http://IP_PROXY:PORT
git config --global http.sslVerify false

# Lancer le clone HTTPS
git clone https://github.com/m0sh3rOne/MAPT.git /opt/MAPT

# NETTOYAGE OBLIGATOIRE (pour des raisons de sécurité post-déploiement)
git config --global --unset http.proxy
git config --global --unset http.sslVerify
```

---

### 4. Exécution de scripts Bash

**Symptômes / Erreurs :**
> `sudo: ./install-server-production.sh: command not found`  
> `.install-server-production.sh: command not found`

**Cause :**
- Les fichiers récupérés via Git n'ont pas toujours les droits d'exécution par défaut.
- Sous Linux, pour exécuter un script situé dans le dossier courant, il faut obligatoirement utiliser le préfixe `./` (et non un simple `.` qui désigne un fichier caché, ni taper le nom du fichier directement).

**Solution :**
Se placer dans le bon dossier, attribuer le droit d'exécution, puis lancer le script avec la bonne syntaxe :

```bash
# 1. Se placer dans le dossier contenant le script
cd /opt/MAPT/scripts/

# 2. Rendre le fichier exécutable
chmod +x install-server-production.sh

# 3. Exécuter le script en tant qu'administrateur
sudo ./install-server-production.sh
```

---

### 5. Perte de connexion réseau après copie / clonage de la VM sur un autre Proxmox

**Symptômes :**
- La machine virtuelle démarre mais n'a plus d'adresse IP (`ip a` n'affiche que `lo`).
- Impossible de se connecter en SSH (`Connection refused` ou `Host unreachable`).
- Aucun accès à Internet depuis la VM.

**Causes fréquentes :**
1. **Changement du nom d'interface ou de l'adresse MAC** : Proxmox réassigne une nouvelle adresse MAC ou un nouvel ID PCI (ex: `ens18` devient `ens19` ou `enp0s18`), tandis qu'Ubuntu/Netplan attend toujours l'ancien nom.
2. **Bridge Proxmox non connecté** : L'interface réseau de la VM pointe vers un bridge inexistant ou inactif (ex: `vmbr0`).
3. **Plan d'adressage IP différent** : L'IP statique de la VM (ex: `192.168.224.236`) n'appartient pas au sous-réseau du nouveau réseau local (ex: `192.168.1.0/24`).

**Procédure de résolution pas-à-pas :**

#### Étape 1 — Vérifier le matériel dans Proxmox
1. Dans l'interface Web Proxmox (`https://IP_PROXMOX:8006`), sélectionnez la VM.
2. Allez dans **Hardware** > **Network Device (net0)** > **Edit** :
   - Vérifiez que le **Bridge** est bien `vmbr0` (le bridge actif du serveur hôte).
   - Vérifiez que la case **Disconnect** n'est **PAS** cochée.
   - Vérifiez que le champ **VLAN Tag** est vide (sauf si votre réseau utilise des VLANs dédiés).

#### Étape 2 — Ouvrir la Console NoVNC de la VM
Comme le SSH ne fonctionne pas encore, ouvrez la **Console** Proxmox (bouton *Console* en haut à droite) et connectez-vous avec votre compte utilisateur.

#### Étape 3 — Identifier le nom réel de la carte réseau
Dans la console de la VM, tapez :
```bash
ip link
```
Repérez le nom de la carte réseau physique (ex: `ens18`, `ens19`, `enp0s18`, `eth0`). Notez s'il est à l'état `DOWN`.

#### Étape 4 — Reconfigurer Netplan (DHCP ou IP Statique)
Éditez le fichier de configuration réseau Netplan :
```bash
sudo nano /etc/netplan/00-installer-config.yaml
# Si absent, vérifiez : sudo nano /etc/netplan/50-cloud-init.yaml ou tout fichier dans /etc/netplan/
```

**Option A : Configuration en DHCP (Recommandé pour récupérer une IP automatique)**
```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:           # <--- Remplacez par le nom exact trouvé à l'Étape 3
      dhcp4: true
```

**Option B : Configuration en IP Statique (adaptée au sous-réseau local)**
```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:           # <--- Nom exact trouvé à l'Étape 3
      addresses:
        - 192.168.1.150/24    # <--- IP dans le sous-réseau du nouveau réseau
      routes:
        - to: default
          via: 192.168.1.1    # <--- Passerelle (IP de la box / routeur)
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

#### Étape 5 — Appliquer la configuration réseau
```bash
sudo netplan apply
```

Vérifiez que la VM a bien récupéré son adresse IP et communique avec l'extérieur :
```bash
ip a
ping -c 3 1.1.1.1
```
Le réseau et l'accès SSH sont immédiatement rétablis.

