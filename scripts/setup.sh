#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# MyFinance — First-time project setup
# ═══════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║    MyFinance — Project Setup          ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ── Check prerequisites ──────────────────────────────
info "Checking prerequisites..."

check_command() {
    if command -v "$1" &> /dev/null; then
        ok "$1 found: $(command -v "$1")"
        return 0
    else
        error "$1 not found. Please install it first."
        return 1
    fi
}

MISSING=0
check_command docker   || MISSING=1
check_command python3  || MISSING=1
check_command node     || MISSING=1
check_command npm      || MISSING=1

if [ "$MISSING" -eq 1 ]; then
    error "Missing prerequisites. Please install them and re-run."
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    error "Docker is not running. Please start Docker Desktop and re-run."
    exit 1
fi
ok "Docker is running"

echo ""

# ── Create backend/.env if it doesn't exist ──────────────────
info "Configuring environment..."
if [ ! -f "$ROOT_DIR/backend/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/backend/.env"
    # Generate random secrets
    if command -v openssl &> /dev/null; then
        SECRET1=$(openssl rand -hex 32)
        SECRET2=$(openssl rand -hex 32)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/change-me-to-a-random-secret-key/$SECRET1/" "$ROOT_DIR/backend/.env"
            sed -i '' "s/change-me-to-another-random-secret-key/$SECRET2/" "$ROOT_DIR/backend/.env"
        else
            sed -i "s/change-me-to-a-random-secret-key/$SECRET1/" "$ROOT_DIR/backend/.env"
            sed -i "s/change-me-to-another-random-secret-key/$SECRET2/" "$ROOT_DIR/backend/.env"
        fi
        ok "backend/.env created with random secrets"
    else
        warn "backend/.env created from example — please update secret keys manually"
    fi
else
    ok "backend/.env already exists"
fi

echo ""

# ── Start infrastructure ─────────────────────────────
info "Starting infrastructure (PostgreSQL + Redis)..."
cd "$ROOT_DIR"
docker compose -f docker-compose.dev.yml up -d
ok "Infrastructure is running"

echo ""

# ── Setup backend ────────────────────────────────────
info "Setting up backend..."
cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv venv
    ok "Virtual environment created"
fi

info "Installing Python dependencies..."
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
ok "Backend dependencies installed"

echo ""

# ── Wait for PostgreSQL to be ready ──────────────────
info "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    if docker compose -f "$ROOT_DIR/docker-compose.dev.yml" exec -T db pg_isready -U myfinance &> /dev/null; then
        ok "PostgreSQL is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        error "PostgreSQL did not start in time"
        exit 1
    fi
    sleep 1
done

# ── Run database migrations ──────────────────────────
info "Running database migrations..."
cd "$ROOT_DIR/backend"
# Migrations will be run once the first migration is created
# alembic upgrade head
warn "No migrations yet — run 'make db-migrate msg=\"initial\"' after creating models"

echo ""

# ── Setup frontend ───────────────────────────────────
info "Setting up frontend..."
cd "$ROOT_DIR/frontend"
npm install
ok "Frontend dependencies installed"

echo ""

# ── Summary ──────────────────────────────────────────
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║              Setup complete!                          ║"
echo "  ╠═══════════════════════════════════════════════════════╣"
echo "  ║                                                       ║"
echo "  ║  Quick start:                                         ║"
echo "  ║    make dev          → Start everything               ║"
echo "  ║    make dev-infra    → Start DB + Redis only          ║"
echo "  ║    make dev-back     → Start backend only             ║"
echo "  ║    make dev-front    → Start frontend only            ║"
echo "  ║                                                       ║"
echo "  ║  URLs:                                                ║"
echo "  ║    Frontend  → http://localhost:3000                  ║"
echo "  ║    Backend   → http://localhost:8000                  ║"
echo "  ║    API Docs  → http://localhost:8000/docs             ║"
echo "  ║    Adminer   → http://localhost:8080                  ║"
echo "  ║                                                       ║"
echo "  ║  Other commands:                                      ║"
echo "  ║    make help         → See all commands               ║"
echo "  ║    make test         → Run all tests                  ║"
echo "  ║    make stop         → Stop everything                ║"
echo "  ║                                                       ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo ""
