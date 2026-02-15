# ═══════════════════════════════════════════════════════
# MyFinance — Makefile
# ═══════════════════════════════════════════════════════
# Usage: make <target>
# Run `make help` to see all available commands.

.PHONY: help setup dev dev-infra dev-back dev-front stop test test-back test-front lint lint-back lint-front db-migrate db-upgrade db-downgrade clean docker-up docker-down

# ── Python venv activation ────────────────────────────
# All backend commands run through the virtualenv
VENV := backend/venv/bin
PYTHON := $(VENV)/python
PIP := $(VENV)/pip
UVICORN := $(VENV)/uvicorn
ALEMBIC := $(VENV)/alembic
PYTEST := $(VENV)/pytest
RUFF := $(VENV)/ruff

# ── Default ───────────────────────────────────────────
help: ## Show this help
	@echo ""
	@echo "  MyFinance — Available commands:"
	@echo "  ──────────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ═══════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════

setup: ## First-time project setup (installs everything)
	@./scripts/setup.sh

# ═══════════════════════════════════════════════════════
# DEVELOPMENT
# ═══════════════════════════════════════════════════════

dev: ## Start full dev environment (infra + back + front)
	@./scripts/dev.sh

dev-infra: ## Start infrastructure only (PostgreSQL + Redis + Adminer)
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "  PostgreSQL : localhost:5432"
	@echo "  Redis      : localhost:6379"
	@echo "  Adminer    : http://localhost:8080"
	@echo ""
	@echo "  Auth is handled by Amazon Cognito (managed service)."
	@echo "  Configure your Cognito settings in .env and frontend/.env"
	@echo ""

dev-back: ## Start backend only (FastAPI with hot-reload)
	cd backend && ../$(UVICORN) app.main:app --reload --host 0.0.0.0 --port 8000

dev-front: ## Start frontend only (Vite dev server)
	cd frontend && npm run dev

stop: ## Stop all dev services
	@echo "Stopping infrastructure..."
	-@docker compose -f docker-compose.dev.yml down 2>/dev/null || true
	@echo "Killing backend/frontend processes..."
	-@pkill -f "uvicorn app.main:app" 2>/dev/null || true
	-@pkill -f "vite" 2>/dev/null || true
	@echo "All services stopped"

# ═══════════════════════════════════════════════════════
# TESTING
# ═══════════════════════════════════════════════════════

test: test-back test-front ## Run all tests (back + front)

test-back: ## Run backend tests
	cd backend && ../$(PYTEST) -v --cov=app --cov-report=term-missing

test-front: ## Run frontend lint + build check
	cd frontend && npm run lint && npm run build

# ═══════════════════════════════════════════════════════
# LINTING
# ═══════════════════════════════════════════════════════

lint: lint-back lint-front ## Run all linters

lint-back: ## Lint backend (ruff)
	cd backend && ../$(RUFF) check . && ../$(RUFF) format --check .

lint-front: ## Lint frontend (eslint)
	cd frontend && npm run lint

format: ## Auto-format all code
	cd backend && ../$(RUFF) format . && ../$(RUFF) check --fix .
	@echo "Backend formatted"

# ═══════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════

db-migrate: ## Create a new migration (usage: make db-migrate msg="add users table")
	cd backend && ../$(ALEMBIC) revision --autogenerate -m "$(msg)"

db-upgrade: ## Apply all pending migrations
	cd backend && ../$(ALEMBIC) upgrade head

db-downgrade: ## Rollback last migration
	cd backend && ../$(ALEMBIC) downgrade -1

db-reset: ## Reset database (drop + recreate + migrate)
	@echo "This will DELETE all data. Press Ctrl+C to cancel..."
	@sleep 3
	docker compose -f docker-compose.dev.yml exec db psql -U myfinance -c "DROP DATABASE IF EXISTS myfinance;"
	docker compose -f docker-compose.dev.yml exec db psql -U myfinance -d postgres -c "CREATE DATABASE myfinance;"
	cd backend && ../$(ALEMBIC) upgrade head
	@echo "Database reset complete"

# ═══════════════════════════════════════════════════════
# DOCKER (full stack, containerized)
# ═══════════════════════════════════════════════════════

docker-up: ## Start all services in Docker (production-like)
	docker compose up -d --build
	@echo ""
	@echo "  Frontend : http://localhost:3000"
	@echo "  Backend  : http://localhost:8000"
	@echo "  API Docs : http://localhost:8000/docs"
	@echo ""

docker-down: ## Stop all Docker services
	docker compose down

docker-logs: ## Tail logs for all Docker services
	docker compose logs -f

# ═══════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════

clean: ## Remove all generated files and caches
	@echo "Cleaning up..."
	rm -rf backend/__pycache__ backend/.pytest_cache backend/.ruff_cache backend/htmlcov
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist
	@echo "Clean complete"

clean-docker: ## Remove all Docker volumes (deletes data)
	-@docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true
	-@docker compose down -v 2>/dev/null || true
	@echo "Docker volumes removed"
