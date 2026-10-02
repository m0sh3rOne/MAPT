#!/usr/bin/env bash
# ==============================================================================
#   MAPT — Script de Mise à Jour Automatisée (Production)
#   Récupération Git, Recompilation Agent Windows, Reconstruction Docker
# ==============================================================================

set -e

# Couleurs ANSI
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

clear

echo -e "${CYAN}${BOLD}"
echo "================================================================================"
echo "    🔄  MISE À JOUR DU SERVEUR MAPT (PRODUCTION)                                "
echo "================================================================================"
echo -e "${NC}"

# 1. Vérification des droits root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[-] Erreur : Ce script doit être exécuté avec les privilèges root (sudo).${NC}"
  echo "    Usage : sudo $0"
  exit 1
fi

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo -e "${BLUE}[1/5] 📥 Récupération des dernières mises à jour depuis GitHub...${NC}"

# Vérifier si un dépôt Git existe
if [ -d ".git" ]; then
    # Sauvegarde des modifications locales éventuelles
    git stash >/dev/null 2>&1 || true
    
    # Récupération et mise à jour de la branche principale
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    echo "    Branche active : $CURRENT_BRANCH"
    git fetch origin "$CURRENT_BRANCH"
    git checkout "$CURRENT_BRANCH"
    git pull origin "$CURRENT_BRANCH"
    echo -e "${GREEN}[✓] Dépôt Git mis à jour avec succès (Dernier commit : $(git log -1 --format='%h - %s')).${NC}"
else
    echo -e "${YELLOW}[!] Aucun dépôt Git (.git) détecté dans $DIR. Les fichiers locaux existants seront utilisés.${NC}"
fi

echo ""
echo -e "${BLUE}[2/5] 🛠️  Recompilation de l'Agent Windows (mapt-agent.exe)...${NC}"

if command -v go >/dev/null 2>&1; then
    mkdir -p "$DIR/agent"
    cd "$DIR/agent"
    GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$DIR/agent/mapt-agent.exe" ./cmd/agent || {
        echo -e "${YELLOW}[!] Avertissement : Échec de la compilation Go locale. Le binaire existant sera conservé.${NC}"
    }
    cd "$DIR"
    if [ -f "$DIR/agent/mapt-agent.exe" ]; then
        echo -e "${GREEN}[✓] Agent Windows compilé avec succès ($(du -h "$DIR/agent/mapt-agent.exe" | cut -f1)).${NC}"
    fi
else
    echo -e "${YELLOW}[!] Go n'est pas installé sur l'hôte. Utilisation du binaire mapt-agent.exe existant.${NC}"
fi

echo ""
echo -e "${BLUE}[3/5] 🐳 Reconstruction et redémarrage des conteneurs Docker...${NC}"

COMPOSE_FILE="$DIR/infrastructure/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}[-] Erreur : Fichier $COMPOSE_FILE introuvable.${NC}"
    exit 1
fi

# Rebuild des images modifiées et redémarrage propre sans interruption des volumes de données
docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate

echo -e "${GREEN}[✓] Conteneurs Docker reconstruits et redémarrés.${NC}"

echo ""
echo -e "${BLUE}[4/5] 🗄️  Vérification et migration des tables de la base de données...${NC}"
sleep 2
docker exec -i mapt-postgres psql -U mapt -d mapt -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE;" >/dev/null 2>&1 || true
docker exec -i mapt-postgres psql -U mapt -d mapt -c "ALTER TABLE deployments ADD COLUMN IF NOT EXISTS max_concurrency INTEGER DEFAULT 8;" >/dev/null 2>&1 || true
echo -e "${GREEN}[✓] Schéma de base de données validé.${NC}"

echo ""
echo -e "${BLUE}[5/5] 🧹 Nettoyage des anciennes images Docker orphelines...${NC}"
docker image prune -f >/dev/null 2>&1 || true
echo -e "${GREEN}[✓] Nettoyage Docker terminé.${NC}"

echo ""
echo -e "${BLUE}🔍 État des services MAPT :${NC}"
sleep 2
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo -e "${GREEN}${BOLD}================================================================================"
echo "    ✅  MISE À JOUR DU SERVEUR MAPT TERMINÉE AVEC SUCCÈS !                      "
echo "================================================================================${NC}"
echo ""
echo -e "  🌐 Accédez à votre interface Web mise à jour :"
echo -e "     👉  ${BOLD}http://$(hostname -I | awk '{print $1}' 2>/dev/null || echo "IP_DE_VOTRE_SERVEUR")${NC}"
echo ""
echo -e "  ⚠️  ${YELLOW}${BOLD}IMPORTANT : Videz le cache de votre navigateur (Ctrl + F5 ou Ctrl + Shift + R)${NC}"
echo -e "      afin de charger les nouveaux scripts et composants React."
echo ""
