# MyFinance

**Application web de gestion de finances personnelles multi-utilisateurs avec intelligence artificielle.**

MyFinance est une application moderne qui permet à chaque utilisateur de gérer ses comptes bancaires, visualiser ses dépenses, analyser son cashflow et bénéficier d'une assistance IA pour la classification automatique des transactions et l'analyse financière.

## Fonctionnalités principales

- **Multi-utilisateurs** : Authentification sécurisée, chaque utilisateur gère ses propres comptes
- **Gestion multi-comptes** : Ajout de plusieurs comptes bancaires avec vue consolidée
- **Import de données** : Import CSV/Excel et formats bancaires courants (OFX, QIF)
- **Tableaux de bord** : Visualisation du cashflow, balance, répartition par catégorie
- **Classification IA** : Classification automatique des transactions par catégorie de dépense
- **Analyse IA** : Assistant conversationnel pour poser des questions sur ses finances
- **Prévisions** : Forecast de cashflow basé sur l'historique

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui |
| Backend | Python 3.12 + FastAPI + SQLAlchemy + Alembic |
| Base de données | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| IA | OpenAI API (GPT-4) + LangChain |
| Infrastructure | Docker + Terraform + Hetzner Cloud |

## Démarrage rapide

### Prérequis

- Docker & Docker Compose
- Node.js 20+ (développement frontend)
- Python 3.12+ (développement backend)

### Lancement avec Docker Compose

```bash
# Cloner le repository
git clone https://github.com/<your-org>/myfinance.git
cd myfinance

# Copier la configuration
cp .env.example backend/.env
# Éditer backend/.env avec vos clés API

# Lancer l'application
docker compose up -d

# L'application est disponible sur http://localhost:3000
# L'API est disponible sur http://localhost:8000
# La documentation API sur http://localhost:8000/docs
```

### Développement local

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev
```

## Documentation

- [Spécifications fonctionnelles](docs/SPECS.md)
- [Architecture & Infrastructure](docs/ARCHITECTURE.md)
- [Backlog](docs/BACKLOG.md)

## Licence

MIT
