#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# MyFinance — Start full development environment
# Launches: infra (PG+Redis) + backend + frontend
# ═══════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

cleanup() {
    echo ""
    info "Shutting down..."
    kill $BACK_PID 2>/dev/null || true
    kill $FRONT_PID 2>/dev/null || true
    docker compose -f "$ROOT_DIR/docker-compose.dev.yml" down
    ok "All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║    MyFinance — Dev Environment        ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ── Check .env ────────────────────────────────────────
if [ ! -f "$ROOT_DIR/backend/.env" ]; then
    warn "backend/.env not found. Run 'make setup' first."
    exit 1
fi

# ── Start infrastructure ─────────────────────────────
info "Starting infrastructure..."
cd "$ROOT_DIR"
docker compose -f docker-compose.dev.yml up -d

# Wait for PG
info "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    if docker compose -f docker-compose.dev.yml exec -T db pg_isready -U myfinance &> /dev/null; then
        ok "PostgreSQL ready"
        break
    fi
    [ "$i" -eq 30 ] && { echo "PostgreSQL timeout"; exit 1; }
    sleep 1
done

ok "Redis ready"

# Ollama (LLM) runs natively on macOS for GPU; see Makefile targets
info "If you want LLM suggestions, ensure native Ollama is running on http://localhost:11434"
info "  - Install/start: make install-ollama-mac (Mac M-series)"
info "  - Status/models: make ollama-status"
echo ""

# ── Start backend ────────────────────────────────────
info "Starting backend (FastAPI)..."
cd "$ROOT_DIR/backend"

# Use venv binary directly (more reliable than source activate)
UVICORN="$ROOT_DIR/backend/venv/bin/uvicorn"
if [ ! -f "$UVICORN" ]; then
    UVICORN="uvicorn"  # fallback to global
    warn "venv not found, using global uvicorn"
fi

$UVICORN app.main:app --reload --host 0.0.0.0 --port 8000 &
BACK_PID=$!
ok "Backend starting on http://localhost:8000 (PID: $BACK_PID)"

echo ""

# ── Start frontend ───────────────────────────────────
info "Starting frontend (Vite)..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONT_PID=$!
ok "Frontend starting on http://localhost:3000 (PID: $FRONT_PID)"

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  All services running:                      │"
echo "  │                                             │"
echo "  │  Frontend  → http://localhost:3000          │"
echo "  │  Backend   → http://localhost:8000          │"
echo "  │  API Docs  → http://localhost:8000/docs     │"
echo "  │  Adminer   → http://localhost:8080          │"
echo "  │  Ollama    → http://localhost:11434 (LLM)   │"
echo "  │                                             │"
echo "  │  Press Ctrl+C to stop all services          │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# Wait for any child process to exit
wait
