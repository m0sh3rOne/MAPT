#!/bin/bash
set -e

echo "=== [MAPT] Configuration et Initialisation du Serveur sous WSL2 Ubuntu ==="

# 1. Démarrage PostgreSQL & Redis
echo "[1/4] Démarrage des services PostgreSQL et Redis..."
echo 'Em%.02H' | sudo -S service postgresql start
echo 'Em%.02H' | sudo -S service redis-server start

# 2. Configuration utilisateur & base PostgreSQL
echo "[2/4] Configuration de la base de données PostgreSQL..."
echo 'Em%.02H' | sudo -S -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mapt') THEN CREATE USER mapt WITH PASSWORD 'mapt_db_pass_2026'; END IF; END \$\$;" || true
echo 'Em%.02H' | sudo -S -u postgres createdb -O mapt mapt 2>/dev/null || true
echo 'Em%.02H' | sudo -S -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mapt TO mapt;" || true

# 3. Installation du binaire MinIO si absent
echo "[3/4] Vérification de MinIO..."
if [ ! -f "$HOME/minio" ]; then
    echo "Téléchargement du binaire MinIO..."
    curl -s -L https://dl.min.io/server/minio/release/linux-amd64/minio -o "$HOME/minio" || true
    chmod +x "$HOME/minio" || true
fi

# 4. Configuration environnement Python Backend
echo "[4/4] Préparation du venv Python backend..."
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "Initialisation terminée avec succès !"
