#!/usr/bin/env bash
# ==============================================================================
#   MAPT — Script d'installation automatisée pour Serveur Ubuntu / Proxmox
#   Configuration interactive, Docker, Docker Compose, compilation Agent Windows
# ==============================================================================

set -e

# Couleurs ANSI pour l'affichage
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear

echo -e "${CYAN}${BOLD}"
echo "================================================================================"
echo "    🚀  INSTALLATION & DÉPLOIEMENT DU SERVEUR MAPT (PRODUCTION)                 "
echo "================================================================================"
echo -e "${NC}"

# 1. Vérification des droits root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[-] Erreur : Ce script doit être exécuté avec les privilèges root (sudo).${NC}"
  echo "    Usage : sudo $0"
  exit 1
fi

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# ==============================================================================
#   ASSISTANT DE CONFIGURATION INTERACTIVE
# ==============================================================================
echo -e "${YELLOW}${BOLD}⚙️  CONFIGURATION INITIALE DU SERVEUR & SÉCURITÉ${NC}"
echo "Veuillez définir les identifiants de l'administrateur et la clé d'enrôlement des agents."
echo "--------------------------------------------------------------------------------"

# A. Nom d'utilisateur Administrateur
read -rp "$(echo -e "${BOLD}1. Nom d'utilisateur Administrateur [défaut: admin] : ${NC}")" ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}

# B. Email Administrateur
read -rp "$(echo -e "${BOLD}2. Adresse Email Administrateur [défaut: ${ADMIN_USERNAME}@mapt.local] : ${NC}")" ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-${ADMIN_USERNAME}@mapt.local}

# C. Mot de passe Administrateur (avec masquage et confirmation)
while true; do
    echo -ne "${BOLD}3. Mot de passe Administrateur : ${NC}"
    read -rs ADMIN_PASSWORD
    echo ""
    
    if [ -z "$ADMIN_PASSWORD" ]; then
        echo -e "${RED}[!] Le mot de passe ne peut pas être vide. Veuillez réessayer.${NC}"
        continue
    fi

    if [ ${#ADMIN_PASSWORD} -lt 6 ]; then
        echo -e "${RED}[!] Le mot de passe doit contenir au moins 6 caractères. Veuillez réessayer.${NC}"
        continue
    fi

    echo -ne "${BOLD}   Confirmez le mot de passe : ${NC}"
    read -rs ADMIN_PASSWORD_CONFIRM
    echo ""

    if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
        echo -e "${GREEN}[✓] Mot de passe validé avec succès.${NC}"
        break
    else
        echo -e "${RED}[!] Les mots de passe ne correspondent pas. Veuillez réessayer.${NC}"
    fi
done

# D. Passphrase / Jeton d'Enrôlement des Agents ($enrollToken)
# Génération d'une valeur suggérée sécurisée
SUGGESTED_TOKEN="mapt-enroll-$(tr -dc 'a-z0-9' < /dev/urandom | head -c 16 2>/dev/null || echo "secret-token-2026")"

echo ""
echo -e "${CYAN}${BOLD}4. Passphrase de Sécurité pour l'Enrôlement des Agents (enrollToken) :${NC}"
echo -e "   Ce jeton secret est partagé avec vos machines Windows lors de leur première connexion."
read -rp "$(echo -e "${BOLD}   Entrez votre Passphrase [défaut généré: ${SUGGESTED_TOKEN}] : ${NC}")" ENROLL_TOKEN
ENROLL_TOKEN=${ENROLL_TOKEN:-$SUGGESTED_TOKEN}

# E. Génération de la clé secrète JWT
JWT_SECRET=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 48 2>/dev/null || echo "mapt_super_secret_jwt_key_for_production_$(date +%s)")

# F. Écriture du fichier .env pour Docker Compose
ENV_FILE="$DIR/infrastructure/.env"
cat <<EOF > "$ENV_FILE"
# ==============================================================================
#   MAPT — Production Environment Configuration (Généré automatiquement)
# ==============================================================================
SECRET_KEY=${JWT_SECRET}
DEFAULT_ENROLLMENT_TOKEN=${ENROLL_TOKEN}

INITIAL_ADMIN_USERNAME=${ADMIN_USERNAME}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}

POSTGRES_DB=mapt
POSTGRES_USER=mapt
POSTGRES_PASSWORD=mapt_db_pass_2026

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
EOF

chmod 600 "$ENV_FILE"

# Écriture également dans backend/.env
cat <<EOF > "$DIR/backend/.env"
SECRET_KEY=${JWT_SECRET}
DEFAULT_ENROLLMENT_TOKEN=${ENROLL_TOKEN}
INITIAL_ADMIN_USERNAME=${ADMIN_USERNAME}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}
EOF
chmod 600 "$DIR/backend/.env"

echo ""
echo -e "${GREEN}[✓] Configuration de sécurité enregistrée dans ${ENV_FILE}${NC}"
echo "--------------------------------------------------------------------------------"
echo ""

# ==============================================================================
#   INSTALLATION SYSTÈME & DOCKER
# ==============================================================================
echo -e "${BLUE}[1/5] Mise à jour des dépôts et installation des paquets prérequis...${NC}"
apt-get update -y
apt-get install -y curl wget git gnupg ca-certificates lsb-release golang-go

if ! command -v docker &> /dev/null; then
    echo -e "${BLUE}[2/5] Installation de Docker Engine & Docker Compose...${NC}"
    install -m 0755 -d /etc/apt/keyrings

    # Tentative d'ajout du dépôt officiel Docker avec options de compatibilité SSL
    DOCKER_REPO_OK=false
    if curl -fsSL --tlsv1.2 --ciphers DEFAULT@SECLEVEL=1 https://download.docker.com/linux/ubuntu/gpg 2>/dev/null | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg 2>/dev/null; then
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        if apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
            DOCKER_REPO_OK=true
        fi
    elif wget -qO- --no-check-certificate https://download.docker.com/linux/ubuntu/gpg 2>/dev/null | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg 2>/dev/null; then
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        if apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
            DOCKER_REPO_OK=true
        fi
    fi

    # Si le dépôt officiel échoue (ex: filtrage SSL / Proxy réseau), bascule transparente sur les paquets officiels Ubuntu
    if [ "$DOCKER_REPO_OK" = false ]; then
        echo -e "${YELLOW}[!] Installation de Docker via les dépôts natifs Ubuntu (docker.io)...${NC}"
        rm -f /etc/apt/sources.list.d/docker.list
        apt-get update -y
        apt-get install -y docker.io docker-compose-v2 docker-compose
    fi

    systemctl enable docker || true
    systemctl start docker || true
    echo -e "${GREEN}[✓] Docker installé et démarré.${NC}"
else
    echo -e "${GREEN}[2/5] Docker Engine est déjà installé.${NC}"
fi

# ==============================================================================
#   COMPILATION DE L'AGENT WINDOWS
# ==============================================================================
echo -e "${BLUE}[3/5] Compilation de l'Agent Windows (mapt-agent.exe)...${NC}"
cd "$DIR/agent"
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o mapt-agent.exe ./cmd/agent
echo -e "${GREEN}[✓] Binaire Windows mapt-agent.exe généré avec succès dans $DIR/agent/mapt-agent.exe.${NC}"

# ==============================================================================
#   DÉMARRAGE DES CONTENEURS DOCKER COMPOSE
# ==============================================================================
echo -e "${BLUE}[4/5] Lancement des conteneurs MAPT (Docker Compose)...${NC}"
cd "$DIR/infrastructure"

# Détection de la commande docker compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

$COMPOSE_CMD down || true
$COMPOSE_CMD up -d --build

# Détection de l'adresse IP du serveur
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
SERVER_IP=${SERVER_IP:-127.0.0.1}

# ==============================================================================
#   RÉCAPITULATIF DE DÉPLOIEMENT
# ==============================================================================
echo ""
echo -e "${GREEN}${BOLD}================================================================================${NC}"
echo -e "${GREEN}${BOLD}  🎉  SERVEUR MAPT INSTALLÉ ET DÉPLOYÉ AVEC SUCCÈS !                            ${NC}"
echo -e "${GREEN}${BOLD}================================================================================${NC}"
echo ""
echo -e "${CYAN}${BOLD}🌐 ACCÈS AUX SERVICES :${NC}"
echo -e "  - Interface Web (Dashboard)  : ${BOLD}http://$SERVER_IP${NC}"
echo -e "  - API REST Backend           : ${BOLD}http://$SERVER_IP/api/v1${NC}"
echo -e "  - Documentation Swagger      : ${BOLD}http://$SERVER_IP/api/v1/docs${NC}"
echo -e "  - Stockage MinIO Console     : ${BOLD}http://$SERVER_IP:9001${NC} (minioadmin / minioadmin)"
echo ""
echo -e "${CYAN}${BOLD}🔑 IDENTIFIANTS ADMINISTRATEUR CONFIGURÉS :${NC}"
echo -e "  - Utilisateur : ${BOLD}${ADMIN_USERNAME}${NC}"
echo -e "  - Email       : ${BOLD}${ADMIN_EMAIL}${NC}"
echo -e "  - Mot de passe: ${YELLOW}(Défini lors de l'assistant)${NC}"
echo ""
echo -e "${CYAN}${BOLD}🛡️  JETON D'ENRÔLEMENT DES AGENTS :${NC}"
echo -e "  - Passphrase (\$enrollToken) : ${BOLD}${ENROLL_TOKEN}${NC}"
echo ""
echo -e "${YELLOW}${BOLD}📦 COMMANDE D'ENRÔLEMENT CLIENT WINDOWS (POWERSHELL ADMIN) :${NC}"
echo -e "  Depuis vos postes clients Windows, exécutez :"
echo ""
echo -e "  ${BOLD}curl.exe -o mapt-agent.exe http://$SERVER_IP/api/v1/agent/download/windows${NC}"
echo -e "  ${BOLD}.\\mapt-agent.exe -service install -server \"http://$SERVER_IP/api/v1\" -enroll-token \"${ENROLL_TOKEN}\"${NC}"
echo -e "  ${BOLD}.\\mapt-agent.exe -service start${NC}"
echo ""
echo -e "${GREEN}================================================================================${NC}"
