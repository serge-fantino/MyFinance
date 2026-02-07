#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# MyFinance — Run all tests
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
error() { echo -e "${RED}[FAIL]${NC} $1"; }

FAILURES=0

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║    MyFinance — Test Suite             ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ── Backend tools (use venv binaries directly) ──────
VENV="$ROOT_DIR/backend/venv/bin"
RUFF="$VENV/ruff"
PYTEST="$VENV/pytest"

# ── Backend tests ────────────────────────────────────
info "Running backend linter (ruff)..."
cd "$ROOT_DIR/backend"

if $RUFF check . && $RUFF format --check .; then
    ok "Backend lint passed"
else
    error "Backend lint failed"
    FAILURES=$((FAILURES + 1))
fi

echo ""
info "Running backend tests (pytest)..."
if $PYTEST -v --tb=short --cov=app --cov-report=term-missing; then
    ok "Backend tests passed"
else
    error "Backend tests failed"
    FAILURES=$((FAILURES + 1))
fi

echo ""

# ── Frontend tests ───────────────────────────────────
info "Running frontend lint (eslint)..."
cd "$ROOT_DIR/frontend"
if npm run lint 2>/dev/null; then
    ok "Frontend lint passed"
else
    error "Frontend lint failed"
    FAILURES=$((FAILURES + 1))
fi

echo ""
info "Running frontend build check..."
if npm run build 2>/dev/null; then
    ok "Frontend build passed"
else
    error "Frontend build failed"
    FAILURES=$((FAILURES + 1))
fi

echo ""

# ── Summary ──────────────────────────────────────────
if [ "$FAILURES" -eq 0 ]; then
    echo -e "  ${GREEN}════════════════════════════════════${NC}"
    echo -e "  ${GREEN}  All tests passed!                 ${NC}"
    echo -e "  ${GREEN}════════════════════════════════════${NC}"
    exit 0
else
    echo -e "  ${RED}════════════════════════════════════${NC}"
    echo -e "  ${RED}  $FAILURES test suite(s) failed    ${NC}"
    echo -e "  ${RED}════════════════════════════════════${NC}"
    exit 1
fi
