#!/usr/bin/env bash
# ==============================================================================
#   MAPT — Compilation d'AppMirror (Frontend embarqué + Backend Windows EXE)
#   Cross-compilation Linux -> Windows (x86_64-pc-windows-gnu)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
AM_FRONT="$DIR/appmirror/frontend"
AM_BACK="$DIR/appmirror/backend"
OUT_EXE="$DIR/agent/appmirror-backend.exe"

if [ ! -d "$AM_BACK" ]; then
    echo "[!] Dossier appmirror/backend introuvable, étape ignorée."
    exit 0
fi

# 1. Prérequis système (mingw-w64, nodejs, npm, rustup)
export DEBIAN_FRONTEND=noninteractive
NEED_APT=""
command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1 || NEED_APT="$NEED_APT mingw-w64"
command -v node >/dev/null 2>&1 || NEED_APT="$NEED_APT nodejs"
command -v npm >/dev/null 2>&1 || NEED_APT="$NEED_APT npm"
command -v curl >/dev/null 2>&1 || NEED_APT="$NEED_APT curl"

if [ -n "$NEED_APT" ] && [ "$EUID" -eq 0 ]; then
    echo "    Installation des prérequis AppMirror ($NEED_APT)..."
    apt-get update -qq >/dev/null 2>&1 || true
    apt-get install -y -qq $NEED_APT >/dev/null 2>&1 || true
fi

export PATH="/root/.cargo/bin:$HOME/.cargo/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
    echo "    Installation de Rustup (toolchain x86_64-pc-windows-gnu)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal >/dev/null 2>&1 || true
    export PATH="/root/.cargo/bin:$HOME/.cargo/bin:$PATH"
fi

if ! command -v cargo >/dev/null 2>&1 || ! command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
    echo "[!] Toolchain Rust/MinGW indisponible. Conservation du binaire agent/appmirror-backend.exe existant."
    exit 0
fi

rustup target add x86_64-pc-windows-gnu >/dev/null 2>&1 || true

# 2. Compilation du frontend embarqué AppMirror
if [ -d "$AM_FRONT" ] && command -v npm >/dev/null 2>&1; then
    echo "    Compilation du frontend embarqué AppMirror..."
    cd "$AM_FRONT"
    if [ ! -d "node_modules" ]; then
        npm install --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund
    fi
    npm run build
fi

# 3. Compilation du backend Rust Windows
echo "    Compilation Rust d'appmirror-backend.exe (x86_64-pc-windows-gnu)..."
cd "$AM_BACK"
cargo build --release --no-default-features --target x86_64-pc-windows-gnu

BUILT_EXE="$AM_BACK/target/x86_64-pc-windows-gnu/release/appmirror-backend.exe"
if [ -f "$BUILT_EXE" ]; then
    mkdir -p "$DIR/agent"
    cp -f "$BUILT_EXE" "$OUT_EXE"
    echo "[✓] appmirror-backend.exe compilé avec succès ($(du -h "$OUT_EXE" | cut -f1))."
else
    echo "[!] Binaire compilé introuvable, conservation du binaire existant."
fi
