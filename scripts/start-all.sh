#!/bin/bash

echo "=========================================================="
echo "   [MAPT] Lancement de l'ensemble de la stack serveur    "
echo "=========================================================="

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# Helper sudo function
run_sudo() {
    if [ -n "$SUDO_PASS" ]; then
        echo "$SUDO_PASS" | sudo -S "$@"
    else
        sudo "$@"
    fi
}

# 1. Services système
echo "[1/4] Démarrage de PostgreSQL et Redis..."
run_sudo service postgresql start
run_sudo service redis-server start

run_sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mapt') THEN CREATE USER mapt WITH PASSWORD 'mapt_db_pass_2026'; END IF; END \$\$;" 2>/dev/null || true
run_sudo -u postgres createdb -O mapt mapt 2>/dev/null || true
run_sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mapt TO mapt;" 2>/dev/null || true
run_sudo -u postgres psql -d mapt -c "GRANT ALL ON SCHEMA public TO mapt; ALTER SCHEMA public OWNER TO mapt;" 2>/dev/null || true

# 2. MinIO
echo "[2/4] Démarrage de MinIO S3..."
mkdir -p "$HOME/minio_data"
if pgrep -x "minio" > /dev/null; then
    echo "MinIO est déjà en cours d'exécution."
elif [ -f "$HOME/minio" ]; then
    MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin "$HOME/minio" server "$HOME/minio_data" --address ":9000" --console-address ":9001" > /tmp/minio.log 2>&1 &
    sleep 2
    echo "MinIO démarré."
fi

# 3. Backend FastAPI sur port 8088
echo "[3/4] Démarrage du Backend FastAPI (Port 8088)..."
cd "$DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Arrêt des anciens processus MAPT
pkill -f "uvicorn app.main:app" || true
pkill -f "app.workers.deployment_worker" || true
sleep 1

# Lancement Backend sur 8088
POSTGRES_SERVER=localhost \
REDIS_HOST=localhost \
MINIO_ENDPOINT=localhost:9000 \
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8088 > /tmp/mapt_backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend FastAPI lancé sur le port 8088 (PID $BACKEND_PID)."

# 4. Worker
echo "[4/4] Démarrage du Worker Asynchrone..."
POSTGRES_SERVER=localhost \
REDIS_HOST=localhost \
python3 -m app.workers.deployment_worker > /tmp/mapt_worker.log 2>&1 &
WORKER_PID=$!
echo "Worker lancé (PID $WORKER_PID)."

sleep 4

WSL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=========================================================="
echo "  STATION SERVEUR MAPT OPÉRATIONNELLE !"
echo "  - API Backend : http://localhost:8088/api/v1 (ou http://$WSL_IP:8088/api/v1)"
echo "  - Swagger Docs : http://localhost:8088/api/v1/docs"
echo "  - MinIO Console : http://localhost:9001 (minioadmin / minioadmin)"
echo "  - Logs Backend : /tmp/mapt_backend.log"
echo "=========================================================="
