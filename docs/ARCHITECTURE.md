# MyFinance — Architecture & Infrastructure

> Version 1.0 — Février 2026

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│              (Navigateur Web / Mobile)                        │
└─────────────┬───────────────────────────────┬───────────────┘
              │ HTTPS                         │ HTTPS
              ▼                               ▼
┌─────────────────────┐         ┌─────────────────────────┐
│   Frontend (SPA)    │         │   API Documentation     │
│   React + Vite      │         │   Swagger UI            │
│   Port 3000         │         │   Port 8000/docs        │
└─────────┬───────────┘         └────────────┬────────────┘
          │ API calls                        │
          ▼                                  │
┌─────────────────────────────────────────────────────────────┐
│                  Reverse Proxy (Caddy)                        │
│          TLS termination + routing + compression              │
│                      Port 443                                 │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Auth API │  │Accounts  │  │Analytics │  │  AI Chat   │  │
│  │          │  │& Txn API │  │  API     │  │    API     │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │              │               │         │
│  ┌────┴──────────────┴──────────────┴───────────────┴─────┐  │
│  │                  Service Layer                          │  │
│  │  AuthService │ AccountService │ ImportService │ EmbeddingSvc│
│  └────┬──────────────┴──────────────┴───────────────┬─────┘  │
│       │                                             │         │
└───────┼─────────────────────────────────────────────┼────────┘
        │                                             │
        ▼                                             ▼
┌───────────────┐  ┌───────────┐            ┌────────────────┐
│  PostgreSQL   │  │   Redis   │            │  sentence-     │
│  16 + pgvector│  │     7     │            │  transformers  │
│               │  │           │            │  (local CPU)   │
│  - Users      │  │  - Cache  │            │                │
│  - Accounts   │  │  - Queue  │            │  - Embeddings  │
│  - Txns       │  │  - Sessions│           │  - Clustering  │
│  - Vectors    │  │           │            │  - Similarity  │
│  - Categories │  │           │            │                │
└───────────────┘  └───────────┘            └────────────────┘
```

---

## 2. Stack technique détaillée

### 2.1 Frontend

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| Framework | **React 18** | Écosystème mature, large communauté |
| Langage | **TypeScript 5** | Type safety, meilleure maintenabilité |
| Bundler | **Vite 5** | Build rapide, HMR instantané |
| CSS | **TailwindCSS 3** | Utilitaire, rapide à prototyper |
| Composants UI | **shadcn/ui** | Composants accessibles, personnalisables, basés sur Radix |
| Graphiques | **Recharts** | Intégration React native, API déclarative |
| State management | **Zustand** | Léger, simple, TypeScript-friendly |
| Requêtes API | **TanStack Query (React Query)** | Cache, refetch, optimistic updates |
| Formulaires | **React Hook Form + Zod** | Validation type-safe |
| Routing | **React Router 6** | Standard React |
| HTTP client | **Axios** | Interceptors pour auth |

### 2.2 Backend

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| Framework | **FastAPI 0.110+** | Async, auto-doc OpenAPI, performant |
| Langage | **Python 3.12** | Écosystème IA/ML riche |
| ORM | **SQLAlchemy 2.0** (async) | ORM mature, support async natif |
| Migrations | **Alembic** | Standard pour SQLAlchemy |
| Validation | **Pydantic v2** | Intégré à FastAPI, performant |
| Auth | **python-jose** (JWT) + **bcrypt** | Standards éprouvés |
| IA (désactivé) | **LangChain** + **OpenAI SDK** | Abstraction LLM, chaînes de prompts (désactivé) |
| Embeddings | **sentence-transformers** | Embeddings multilingual locaux (CPU) |
| Vecteurs | **pgvector** | Extension PostgreSQL pour similarité vectorielle |
| Clustering | **scikit-learn** (HDBSCAN) | Regroupement de transactions similaires |
| Import fichiers | **openpyxl** (Excel) + **ofxparse** | Parsing des formats financiers |
| Tâches async | **ARQ** (Redis-based) | File d'attente légère, async native |
| Tests | **pytest** + **httpx** | Tests async, fixtures |
| Linting | **Ruff** | Ultra-rapide, remplace flake8+black+isort |

### 2.3 Base de données

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| SGBD | **PostgreSQL 16** + **pgvector** | Robuste, JSON, fulltext search, similarité vectorielle |
| Cache | **Redis 7** | Cache de sessions, queue de tâches, rate limiting |

### 2.4 Infrastructure

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| Conteneurisation | **Docker** | Reproductibilité, isolation |
| Orchestration locale | **Docker Compose** | Développement et staging |
| IaC | **Terraform** | Standard, multi-cloud |
| Cloud | **Hetzner Cloud** | Très abordable (3-5€/mois par VM), datacenters EU |
| Reverse Proxy | **Caddy** | HTTPS automatique, config simple |
| CI/CD | **GitHub Actions** | Intégré à GitHub, gratuit pour les repos publics |

---

## 3. Modèle de données

### 3.1 Diagramme Entité-Relation

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    users     │       │    accounts      │       │  transactions    │
├──────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)      │──┐    │ id (PK)          │──┐    │ id (PK)          │
│ email        │  │    │ user_id (FK)     │  │    │ account_id (FK)  │
│ password_hash│  └───▶│ name             │  └───▶│ date             │
│ full_name    │       │ type             │       │ value_date       │
│ is_active    │       │ currency         │       │ label_raw        │
│ is_admin     │       │ bank_name        │       │ label_clean      │
│ preferences  │       │ account_number   │       │ amount           │
│ created_at   │       │ initial_balance  │       │ currency         │
│ updated_at   │       │ color            │       │ category_id (FK) │
│ deleted_at   │       │ status           │       │ subcategory      │
└──────────────┘       │ created_at       │       │ notes            │
                       │ updated_at       │       │ tags             │
       ┌──────────┐    └──────────────────┘       │ dedup_hash       │
       │categories│                                │ source           │
       ├──────────┤                                │ ai_confidence    │
       │id (PK)   │◀──────────────────────────────│ embedding        │ ← vector(384)
       │user_id   │                                │ created_at       │
       │name      │                                │ updated_at       │
       │parent_id │    ┌──────────────────┐        │ deleted_at       │
       │icon      │    │  conversations   │        └──────────────────┘
       │color     │    ├──────────────────┤
       │is_system │    │ id (PK)          │        ┌──────────────────┐
       │created_at│    │ user_id (FK)     │        │    messages      │
       └─────┬────┘    │ title            │        ├──────────────────┤
             │         │ created_at       │        │ id (PK)          │
             │         │ updated_at       │        │ conversation_id  │
             │         └──────────────────┘───────▶│ role             │
             │                                     │ content          │
             │    ┌──────────────────────┐         │ metadata         │
             │    │classification_rules  │         │ created_at       │
             │    ├──────────────────────┤         └──────────────────┘
             └───▶│ id (PK)             │
                  │ user_id (FK)        │
                  │ pattern             │  ← texte de correspondance
                  │ match_type          │  ← contains | exact | starts_with
                  │ category_id (FK)    │
                  │ custom_label        │  ← libellé personnalisé ("Salaire Serge")
                  │ priority            │  ← ordre d'évaluation
                  │ is_active           │
                  │ created_by          │  ← manual | ai
                  │ created_at          │
                  │ updated_at          │
                  └──────────────────────┘

       ┌──────────────────┐
       │  import_logs     │
       ├──────────────────┤
       │ id (PK)          │
       │ user_id (FK)     │
       │ account_id (FK)  │
       │ filename         │
       │ format           │
       │ status           │
       │ total_rows       │
       │ imported_count   │
       │ duplicate_count  │
       │ error_count      │
       │ errors_detail    │
       │ created_at       │
       └──────────────────┘
```

### 3.2 Index clés

```sql
-- Recherche de transactions par utilisateur et période
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date DESC);

-- Recherche fulltext sur les libellés
CREATE INDEX idx_transactions_label_gin ON transactions USING gin(to_tsvector('french', label_raw));

-- Déduplication à l'import
CREATE UNIQUE INDEX idx_transactions_dedup ON transactions(dedup_hash) WHERE deleted_at IS NULL;

-- Catégories par utilisateur
CREATE INDEX idx_categories_user ON categories(user_id);

-- Règles de classification par utilisateur
CREATE INDEX idx_classification_rules_user ON classification_rules(user_id, is_active);

-- Recherche de similarité vectorielle (pgvector HNSW)
CREATE INDEX idx_transactions_embedding ON transactions USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Architecture API

### 4.1 Structure des endpoints

```
/api/v1
├── /auth
│   ├── POST   /register          # Inscription
│   ├── POST   /login             # Connexion
│   ├── POST   /refresh           # Refresh token
│   ├── POST   /logout            # Déconnexion
│   └── POST   /forgot-password   # Mot de passe oublié
│
├── /users
│   ├── GET    /me                # Profil courant
│   ├── PATCH  /me                # Modifier profil
│   └── DELETE /me                # Supprimer compte
│
├── /accounts
│   ├── GET    /                  # Liste des comptes
│   ├── POST   /                  # Créer un compte
│   ├── GET    /:id               # Détail d'un compte
│   ├── PATCH  /:id               # Modifier un compte
│   ├── DELETE /:id               # Archiver un compte
│   ├── POST   /:id/calibrate     # Calibrer le solde
│   └── GET    /summary           # Vue consolidée
│
├── /transactions
│   ├── GET    /                  # Liste (paginée, filtrable)
│   ├── POST   /                  # Créer manuellement
│   ├── GET    /cashflow          # Données cashflow (mensuel/journalier)
│   ├── POST   /compute-embeddings # Calculer les embeddings manquants (local)
│   ├── GET    /clusters          # Clusters de transactions similaires + suggestions
│   ├── POST   /clusters/classify # Classifier un cluster de transactions
│   ├── GET    /:id               # Détail
│   ├── PATCH  /:id               # Modifier (+ crée une règle si catégorie changée)
│   ├── DELETE /:id               # Supprimer
│   └── POST   /import            # Import fichier (+ auto-classify)
│
├── /categories
│   ├── GET    /                  # Liste des catégories (arbre)
│   ├── POST   /                  # Créer une catégorie utilisateur
│   ├── PATCH  /:id               # Modifier (utilisateur uniquement)
│   └── DELETE /:id               # Supprimer (utilisateur uniquement)
│
├── /classification-rules
│   ├── GET    /                  # Liste des règles de l'utilisateur
│   ├── POST   /                  # Créer une règle
│   ├── PATCH  /:id               # Modifier une règle
│   ├── DELETE /:id               # Supprimer une règle
│   └── POST   /apply             # Appliquer toutes les règles actives aux transactions non classées
│
├── /analytics
│   ├── GET    /cashflow          # Données cashflow
│   ├── GET    /by-category       # Répartition par catégorie
│   ├── GET    /balance-history   # Historique des soldes
│   ├── GET    /forecast          # Prévisions
│   └── GET    /recurring         # Transactions récurrentes détectées
│
└── /ai
    ├── POST   /chat              # Envoyer un message
    ├── GET    /conversations     # Liste conversations
    ├── GET    /conversations/:id # Historique d'une conversation
    └── POST   /classify          # Classifier des transactions
```

### 4.2 Conventions API

- **Format** : JSON
- **Pagination** : `?page=1&per_page=50` → réponse avec `{ data: [], meta: { total, page, per_page, pages } }`
- **Filtrage** : Query params (`?account_id=1&date_from=2026-01-01&date_to=2026-01-31`)
- **Tri** : `?sort_by=date&sort_order=desc`
- **Erreurs** : Format uniforme `{ error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }`
- **Versioning** : Préfixe URL `/api/v1`

**Convention importante — Pas de trailing slash :**

Les routes "collection" utilisent `@router.get("")` (chaîne vide) et **jamais** `@router.get("/")`.
FastAPI est configuré avec `redirect_slashes=False`.

> **Pourquoi ?** Quand le frontend (Vite proxy sur `:3000`) appelle `/api/v1/accounts`
> et que FastAPI a une route `/accounts/`, il renvoie un **307 redirect** vers
> `http://localhost:8000/api/v1/accounts/`. Le navigateur suit ce redirect
> en cross-origin et **supprime le header `Authorization`** (comportement standard).
> Résultat : 401 Unauthorized. Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md) pour les détails.

---

## 5. Architecture Backend

### 5.1 Structure des couches

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Point d'entrée FastAPI
│   ├── config.py               # Configuration (pydantic-settings)
│   │
│   ├── core/                   # Fondations transverses
│   │   ├── security.py         # JWT, hashing, auth dependencies
│   │   ├── database.py         # Engine, session factory
│   │   ├── exceptions.py       # Exceptions métier
│   │   └── middleware.py       # CORS, rate limiting, logging
│   │
│   ├── models/                 # Modèles SQLAlchemy (ORM)
│   │   ├── base.py             # Base declarative + mixins
│   │   ├── user.py
│   │   ├── account.py
│   │   ├── transaction.py
│   │   ├── category.py
│   │   └── conversation.py
│   │
│   ├── schemas/                # Schémas Pydantic (validation I/O)
│   │   ├── user.py
│   │   ├── account.py
│   │   ├── transaction.py
│   │   ├── category.py
│   │   ├── analytics.py
│   │   └── ai.py
│   │
│   ├── api/                    # Routes (Controllers)
│   │   ├── deps.py             # Dependencies communes (get_db, get_current_user)
│   │   └── v1/
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── accounts.py
│   │       ├── transactions.py
│   │       ├── categories.py
│   │       ├── analytics.py
│   │       └── ai.py
│   │
│   ├── services/               # Logique métier
│   │   ├── auth_service.py
│   │   ├── account_service.py
│   │   ├── transaction_service.py
│   │   ├── import_service.py
│   │   ├── category_service.py
│   │   ├── analytics_service.py
│   │   ├── embedding_service.py  # Classification par embeddings (local)
│   │   └── ai_service.py         # OpenAI (désactivé)
│   │
│   └── utils/                  # Utilitaires
│       ├── file_parsers.py     # Parsers CSV, Excel, OFX, QIF
│       └── currency.py         # Conversion de devises
│
├── migrations/                 # Alembic
│   ├── env.py
│   └── versions/
│
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_accounts.py
│   ├── test_transactions.py
│   └── test_import.py
│
├── Dockerfile
├── requirements.txt
├── alembic.ini
└── pyproject.toml
```

### 5.2 Patterns architecturaux

- **Repository Pattern** : Les services accèdent aux données via SQLAlchemy, pas directement dans les routes
- **Dependency Injection** : FastAPI Depends() pour l'injection de session DB, user courant, etc.
- **Service Layer** : Toute la logique métier dans `/services`, les routes sont minimalistes
- **DTO Pattern** : Pydantic schemas séparent clairement input/output de la couche ORM

---

## 6. Architecture Frontend

### 6.1 Structure

```
frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                # Point d'entrée
│   ├── App.tsx                 # Router + providers
│   │
│   ├── components/             # Composants réutilisables
│   │   ├── ui/                 # shadcn/ui (Button, Card, Dialog...)
│   │   ├── layout/             # Header, Sidebar, Footer
│   │   ├── charts/             # CashflowChart, CategoryPie, BalanceLine
│   │   └── common/             # DataTable, FileUpload, SearchInput
│   │
│   ├── pages/                  # Pages (1 par route)
│   │   ├── auth/               # Login, Register
│   │   ├── dashboard/          # Dashboard principal
│   │   ├── accounts/           # Liste, détail, création
│   │   ├── transactions/       # Liste, import
│   │   ├── analytics/          # Cashflow, catégories, forecast
│   │   ├── ai-chat/            # Assistant IA
│   │   └── settings/           # Profil, préférences, catégories
│   │
│   ├── hooks/                  # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useAccounts.ts
│   │   ├── useTransactions.ts
│   │   └── useAnalytics.ts
│   │
│   ├── services/               # Appels API
│   │   ├── api.ts              # Instance Axios configurée
│   │   ├── auth.service.ts
│   │   ├── account.service.ts
│   │   ├── transaction.service.ts
│   │   ├── analytics.service.ts
│   │   └── ai.service.ts
│   │
│   ├── store/                  # Zustand stores
│   │   ├── auth.store.ts
│   │   └── ui.store.ts
│   │
│   ├── types/                  # Types TypeScript
│   │   ├── auth.types.ts
│   │   ├── account.types.ts
│   │   ├── transaction.types.ts
│   │   └── analytics.types.ts
│   │
│   ├── utils/                  # Utilitaires
│   │   ├── format.ts           # Formatage monétaire, dates
│   │   └── validators.ts       # Schémas Zod
│   │
│   └── styles/
│       └── globals.css         # TailwindCSS base
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile
└── .eslintrc.cjs
```

---

## 7. Infrastructure & Déploiement

### 7.1 Choix du cloud : Hetzner Cloud

**Pourquoi Hetzner ?**
- Prix imbattables : serveur CX22 (2 vCPU, 4 Go RAM) à **4,35€/mois**
- Datacenters en Europe (Allemagne, Finlande) → conformité RGPD
- API complète + provider Terraform officiel
- Volumes, réseaux privés, load balancers, firewalls inclus
- Excellent rapport qualité/prix pour un projet personnel/startup

**Coût estimé (environnement production)**

| Ressource | Spécification | Coût/mois |
|-----------|--------------|-----------|
| Serveur App | CX22 (2 vCPU, 4 Go) | 4,35 € |
| Serveur DB | CX22 (2 vCPU, 4 Go) | 4,35 € |
| Volume (DB) | 20 Go SSD | 0,96 € |
| Floating IP | 1 IPv4 | 3,57 € |
| Backups | Automatiques (20%) | ~1,74 € |
| **Total** | | **~15 €/mois** |

> Note : Pour démarrer, un seul serveur CX22 suffit (~5€/mois) avec tous les services en Docker Compose.

### 7.2 Architecture de déploiement

```
┌─────────────────────────────────────────────────────┐
│                   Hetzner Cloud                      │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │         Floating IP (public)                │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐    │
│  │           App Server (CX22)                  │    │
│  │                                              │    │
│  │  ┌─────────┐  ┌─────────┐  ┌────────────┐  │    │
│  │  │  Caddy  │  │ Backend │  │  Frontend  │  │    │
│  │  │ (proxy) │  │ FastAPI │  │   (Nginx)  │  │    │
│  │  └────┬────┘  └────┬────┘  └─────┬──────┘  │    │
│  │       │            │              │          │    │
│  │  ┌────▼────────────▼──────────────▼──────┐  │    │
│  │  │           Docker Network              │  │    │
│  │  └────┬──────────────────────┬───────────┘  │    │
│  │       │                      │               │    │
│  │  ┌────▼─────┐          ┌────▼─────┐         │    │
│  │  │PostgreSQL│          │  Redis   │         │    │
│  │  │  :5432   │          │  :6379   │         │    │
│  │  └──────────┘          └──────────┘         │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │      Hetzner Volume (20 Go, monté)           │    │
│  │      /mnt/data/postgres                      │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │      Hetzner Firewall                        │    │
│  │      - 443 (HTTPS) : ouvert                  │    │
│  │      - 22 (SSH) : IP restreinte              │    │
│  │      - Tout le reste : fermé                 │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 7.3 Terraform (IaC)

Fichiers Terraform dans `infra/terraform/` :

```
infra/terraform/
├── main.tf              # Provider Hetzner + resources principales
├── variables.tf         # Variables d'entrée
├── outputs.tf           # Outputs (IP, etc.)
├── firewall.tf          # Règles de firewall
├── terraform.tfvars.example  # Exemple de variables
└── user-data.sh         # Script cloud-init
```

### 7.4 CI/CD (GitHub Actions)

```yaml
# Workflow simplifié
on push to main:
  1. Lint & Test (backend + frontend)
  2. Build Docker images
  3. Push images to GitHub Container Registry
  4. SSH deploy sur le serveur Hetzner
  5. docker compose pull && docker compose up -d
```

### 7.5 Backups

- **PostgreSQL** : `pg_dump` quotidien via cron, stocké sur Hetzner Volume
- **Rétention** : 7 jours rolling + 1 mensuel (3 mois)
- **Optionnel** : Sync vers Hetzner Object Storage (S3-compatible)

---

## 8. Sécurité

### 8.1 Réseau
- Firewall Hetzner : seuls ports 443 et 22 ouverts
- SSH par clé uniquement, pas de mot de passe
- Caddy : TLS automatique via Let's Encrypt
- Réseau Docker interne pour les services

### 8.2 Application
- JWT access token (30 min) + refresh token (7 jours, HttpOnly cookie)
- Bcrypt pour le hashing des mots de passe (cost=12)
- Rate limiting : 5 tentatives de login / 15 min par IP
- CORS strict : uniquement le domaine frontend
- Headers de sécurité (CSP, HSTS, X-Frame-Options)
- Données sensibles chiffrées en base (AES-256 pour numéros de compte)

### 8.3 IA
- Prompts système non modifiables
- Injection de contexte utilisateur côté serveur uniquement
- Pas de données financières persistées chez OpenAI

---

## 9. Monitoring & Observabilité

### 9.1 Phase 1 (MVP)
- Logs structurés (JSON) via `structlog`
- Healthcheck endpoints (`/health`, `/ready`)
- Docker healthchecks
- Alertes basiques via webhook Discord/Slack

### 9.2 Phase 2 (Post-MVP)
- Prometheus + Grafana (métriques applicatives)
- Sentry (error tracking)
- Uptime monitoring (UptimeRobot ou Hetrixtools, gratuit)

---

## 10. Environnements

| Environnement | Usage | Infrastructure |
|--------------|-------|----------------|
| **Local** | Développement | Docker Compose (infra) + processus natifs (app) |
| **Staging** | Tests pré-production | Même serveur Hetzner, namespace séparé |
| **Production** | Utilisateurs finaux | Serveur Hetzner dédié |

---

## 11. Développement local

### 11.1 Architecture locale

En local, on sépare **l'infrastructure** (conteneurisée) de **l'application** (native) pour bénéficier du hot-reload :

```
┌─────────────────────────────────────────────────────┐
│                Machine développeur                    │
│                                                      │
│  ┌─────────────────────────────┐   ┌──────────────┐ │
│  │ Docker Compose (infra)      │   │   Processus  │ │
│  │  docker-compose.dev.yml     │   │   natifs     │ │
│  │                             │   │              │ │
│  │  ┌──────────┐ ┌──────────┐ │   │  uvicorn     │ │
│  │  │PostgreSQL│ │  Redis   │ │◀──│  (backend)   │ │
│  │  │  :5432   │ │  :6379   │ │   │  :8000       │ │
│  │  └──────────┘ └──────────┘ │   │              │ │
│  │                             │   │  vite        │ │
│  │  ┌──────────┐              │   │  (frontend)  │ │
│  │  │ Adminer  │              │   │  :3000       │ │
│  │  │  :8080   │              │   │              │ │
│  │  └──────────┘              │   └──────────────┘ │
│  └─────────────────────────────┘                    │
└─────────────────────────────────────────────────────┘
```

> **Note :** Terraform n'est pas utilisé en local. Il sert uniquement à provisionner
> l'infrastructure cloud (Hetzner). En local, Docker Compose joue le rôle d'IaC
> pour les services d'infrastructure (base de données, cache).

### 11.2 Scripts et commandes

Tous les scripts sont accessibles via le `Makefile` à la racine du projet :

```bash
make help           # Affiche toutes les commandes disponibles
```

**Premier lancement :**

```bash
make setup          # Installe tout (venv, npm, .env, lance PG+Redis)
```

**Développement quotidien :**

```bash
make dev            # Lance tout (infra + backend + frontend), Ctrl+C pour arrêter
# OU séparément :
make dev-infra      # PostgreSQL + Redis + Adminer uniquement
make dev-back       # Backend FastAPI avec hot-reload
make dev-front      # Frontend Vite avec HMR
make stop           # Arrête tous les services
```

**Tests et qualité :**

```bash
make test           # Tous les tests (back + front)
make test-back      # pytest avec couverture
make test-front     # lint + build check
make lint           # Linters (ruff + eslint)
make format         # Auto-format du code Python
```

**Base de données :**

```bash
make db-migrate msg="add users table"   # Créer une migration
make db-upgrade                         # Appliquer les migrations
make db-downgrade                       # Rollback dernière migration
make db-reset                           # ⚠️ Reset complet de la BDD
```

**Docker (mode production-like) :**

```bash
make docker-up      # Tout en conteneurs (comme en prod)
make docker-down    # Arrêter
make docker-logs    # Voir les logs
```

### 11.3 URLs en développement

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Application React (Vite HMR) |
| Backend | http://localhost:8000 | API FastAPI |
| API Docs | http://localhost:8000/docs | Swagger UI auto-généré |
| API Docs | http://localhost:8000/redoc | ReDoc |
| Adminer | http://localhost:8080 | Interface web PostgreSQL |
| Health | http://localhost:8000/health | Liveness probe |
| Ready | http://localhost:8000/ready | Readiness probe (vérifie la BDD) |

### 11.4 Fichiers Docker Compose

| Fichier | Usage |
|---------|-------|
| `docker-compose.dev.yml` | **Dev local** — Infra uniquement (PG + Redis + Adminer) |
| `docker-compose.yml` | **Production-like** — Tout conteneurisé (PG + Redis + Backend + Frontend) |
