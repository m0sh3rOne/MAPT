#!/bin/bash
set -e

echo "=== [MAPT] Démarrage de la stack serveur dans WSL2 Ubuntu ==="

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR/infrastructure"

echo "Démarrage du service Docker..."
if [ -n "$SUDO_PASS" ]; then
    echo "$SUDO_PASS" | sudo -S service docker start || true
else
    sudo service docker start || true
fi

echo "Lancement des conteneurs via Docker Compose..."
docker compose up -d --build

echo "Attente du démarrage des conteneurs..."
sleep 5
docker compose ps

WSL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "================================================================="
echo "  Serveur MAPT actif !"
echo "  - API Backend : http://localhost:8000/api/v1 (ou http://$WSL_IP:8000/api/v1)"
echo "  - Documentation Swagger : http://localhost:8000/api/v1/docs"
echo "  - MinIO Console : http://localhost:9001"
echo "================================================================="
