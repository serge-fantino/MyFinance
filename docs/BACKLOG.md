# MyFinance — Backlog

> Version 1.0 — Février 2026
> Méthodologie : tickets organisés par Epic, priorisés par Sprint

---

## Légende

- **Priorité** : P0 (critique) → P3 (nice-to-have)
- **Taille** : XS (< 2h), S (2-4h), M (4-8h), L (1-2j), XL (2-4j)
- **Sprint** : Itérations de 2 semaines

---

## Sprint 1 — Fondations (Semaines 1-2)

> Objectif : Poser les bases du projet, authentification fonctionnelle, premier déploiement.

### Epic 1 : Setup du projet

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 1.1 | Setup backend FastAPI | P0 | M | Créer le squelette FastAPI avec config, middleware CORS, healthcheck, structure de dossiers |
| 1.2 | Setup base de données | P0 | M | Configurer PostgreSQL, SQLAlchemy async, Alembic, créer les premières migrations |
| 1.3 | Setup frontend React | P0 | M | Initialiser Vite + React + TypeScript + TailwindCSS + shadcn/ui, routing de base |
| 1.4 | Setup Docker Compose | P0 | S | Dockerfiles backend/frontend, docker-compose.yml avec PG + Redis |
| 1.5 | Setup CI GitHub Actions | P1 | M | Pipeline : lint + test backend, lint + build frontend |

### Epic 2 : Authentification

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 2.1 | Modèle User + migration | P0 | S | Modèle SQLAlchemy User, migration Alembic, champs email/password/name |
| 2.2 | API inscription | P0 | M | POST /auth/register avec validation, hashing bcrypt, retour JWT |
| 2.3 | API connexion | P0 | M | POST /auth/login, vérification credentials, génération JWT + refresh token |
| 2.4 | API refresh token | P0 | S | POST /auth/refresh, rotation du refresh token |
| 2.5 | Middleware auth | P0 | M | Dependency FastAPI pour extraire et valider le JWT, injecter current_user |
| 2.6 | Page Login frontend | P0 | M | Formulaire login, appel API, stockage token, redirection |
| 2.7 | Page Register frontend | P0 | M | Formulaire inscription, validation Zod, appel API |
| 2.8 | Guard de routes protégées | P0 | S | HOC/wrapper pour rediriger vers login si non authentifié |
| 2.9 | Layout principal | P0 | M | Header avec menu utilisateur, sidebar navigation, zone de contenu |

---

## Sprint 2 — Comptes & Transactions (Semaines 3-4)

> Objectif : CRUD comptes, import de base, liste des transactions.

### Epic 3 : Gestion des comptes

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 3.1 | Modèle Account + migration | P0 | S | Modèle Account avec tous les champs, FK vers User |
| 3.2 | API CRUD comptes | P0 | M | GET/POST/PATCH/DELETE /accounts, filtrage par user |
| 3.3 | API vue consolidée | P0 | S | GET /accounts/summary → solde total, nombre de comptes |
| 3.4 | Page liste des comptes | P0 | M | Cards avec solde, type, banque ; bouton ajouter |
| 3.5 | Modal création/édition compte | P0 | M | Formulaire avec tous les champs, validation |
| 3.6 | Calcul du solde actuel | P0 | S | Solde = initial_balance + SUM(transactions.amount) |

### Epic 4 : Transactions

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 4.1 | Modèle Transaction + migration | P0 | M | Modèle avec tous les champs, index, hash de dédup |
| 4.2 | API liste transactions | P0 | M | GET /transactions avec pagination, filtres (compte, date, catégorie, montant, texte) |
| 4.3 | API CRUD transaction | P0 | S | POST/PATCH/DELETE une transaction |
| 4.4 | Page liste transactions | P0 | L | DataTable avec colonnes triables, filtres, recherche, pagination |
| 4.5 | Création manuelle transaction | P1 | M | Formulaire dans une modal/drawer |

### Epic 5 : Import de données

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 5.1 | Parser CSV | P0 | M | Parsing CSV avec détection séparateur, encoding, mapping colonnes |
| 5.2 | Parser Excel | P0 | M | Parsing .xlsx avec openpyxl, même logique que CSV |
| 5.3 | API import fichier | P0 | L | POST /transactions/import : upload, parse, preview, confirm |
| 5.4 | Détection de doublons | P0 | M | Hash (date + montant + libellé), skip des doublons |
| 5.5 | UI d'import | P0 | L | Upload, prévisualisation, mapping colonnes, confirmation, rapport |
| 5.6 | Modèle ImportLog | P1 | S | Historique des imports (fichier, stats, erreurs) |

---

## Sprint 3 — Catégorisation & Dashboard (Semaines 5-6)

> Objectif : Catégories, classification IA basique, premier dashboard.

### Epic 6 : Catégorisation

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 6.1 | Modèle Category + migration | P0 | S | Catégories hiérarchiques (parent_id), système + custom user |
| 6.2 | Seed catégories par défaut | P0 | S | Script pour insérer l'arbre de catégories par défaut |
| 6.3 | API CRUD catégories | P0 | M | GET/POST/PATCH/DELETE /categories |
| 6.4 | UI gestion catégories | P1 | M | Page settings avec arbre de catégories, ajout/modif/suppression |
| 6.5 | Assignation manuelle catégorie | P0 | S | Dropdown de catégorie dans la liste des transactions |

### Epic 7 : Classification IA

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 7.1 | Service IA classification | P0 | L | Appel OpenAI pour classifier une transaction (libellé → catégorie) |
| 7.2 | Classification batch à l'import | P0 | M | Après import, lancer la classification async sur les nouvelles transactions |
| 7.3 | Feedback loop | P1 | M | Quand l'utilisateur corrige une catégorie, enrichir le contexte IA |
| 7.4 | Affichage confiance IA | P1 | S | Badge de confiance (haute/moyenne/basse) sur les catégories IA |

### Epic 8 : Dashboard

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 8.1 | API cashflow | P0 | M | GET /analytics/cashflow → revenus/dépenses par mois |
| 8.2 | API répartition catégories | P0 | M | GET /analytics/by-category → montants par catégorie |
| 8.3 | API historique solde | P0 | M | GET /analytics/balance-history → évolution du solde |
| 8.4 | Widget solde global | P0 | S | Card avec le solde total et par compte |
| 8.5 | Graphique cashflow | P0 | M | Bar chart revenus vs dépenses (Recharts) |
| 8.6 | Graphique catégories | P0 | M | Donut/pie chart répartition dépenses |
| 8.7 | Graphique évolution solde | P0 | M | Line chart sur 12 mois |
| 8.8 | Dernières transactions | P1 | S | Liste des 10 dernières sur le dashboard |
| 8.9 | Filtres période/compte | P0 | M | Sélecteur de période et de compte(s) global au dashboard |

---

## Sprint 4 — Analyses avancées & Chat IA (Semaines 7-8)

> Objectif : Analyses avancées, forecast, assistant IA conversationnel.

### Epic 9 : Analyses avancées

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 9.1 | Page analyse cashflow | P0 | L | Vue dédiée cashflow avec graphique waterfall, drill-down mensuel |
| 9.2 | Page analyse catégories | P0 | L | Vue dédiée avec évolution, comparaison, drill-down vers transactions |
| 9.3 | Détection récurrences | P1 | L | Algorithme de détection des transactions récurrentes (loyer, abos...) |
| 9.4 | API forecast | P1 | L | Projection 3 mois basée sur moyenne mobile + récurrences |
| 9.5 | Graphique forecast | P1 | M | Line chart avec zone de confiance |

### Epic 10 : Assistant IA (Chat)

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 10.1 | Modèle Conversation + Message | P0 | S | Modèles SQLAlchemy pour persister les conversations |
| 10.2 | Service AI Chat | P0 | XL | LangChain agent avec accès aux données utilisateur, tools pour requêter les transactions/analytics |
| 10.3 | API chat | P0 | M | POST /ai/chat (streaming SSE), GET /ai/conversations |
| 10.4 | UI chat | P0 | L | Interface chat avec historique, markdown, streaming des réponses |
| 10.5 | Contexte utilisateur pour l'IA | P0 | M | Injection sécurisée des données financières dans le prompt |

---

## Sprint 5 — Polish & Déploiement (Semaines 9-10)

> Objectif : Qualité, sécurité, mise en production.

### Epic 11 : Profil & Paramètres

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 11.1 | API profil utilisateur | P1 | S | GET/PATCH /users/me |
| 11.2 | Page profil | P1 | M | Modification nom, email, mot de passe |
| 11.3 | Préférences utilisateur | P2 | M | Devise par défaut, thème, langue |
| 11.4 | Suppression de compte | P2 | S | Soft delete avec période de grâce |

### Epic 12 : Sécurité & Qualité

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 12.1 | Rate limiting | P0 | M | Limiter les endpoints auth (Redis-based) |
| 12.2 | Tests unitaires backend | P0 | XL | Couverture 80% sur services et API |
| 12.3 | Tests frontend | P1 | L | Tests composants clés (Vitest + Testing Library) |
| 12.4 | Audit sécurité | P1 | M | Revue OWASP, headers, injection, XSS |
| 12.5 | Chiffrement données sensibles | P1 | M | AES-256 pour numéros de compte en base |

### Epic 13 : Infrastructure & Déploiement

| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 13.1 | Terraform Hetzner | P0 | L | Scripts Terraform pour provisionner serveur + volume + firewall |
| 13.2 | Configuration Caddy | P0 | S | Reverse proxy avec HTTPS automatique |
| 13.3 | Docker production | P0 | M | Dockerfiles optimisés (multi-stage), docker-compose.prod.yml |
| 13.4 | GitHub Actions deploy | P0 | L | Pipeline CI/CD complet : test → build → push → deploy |
| 13.5 | Backup automatique | P1 | M | Cron pg_dump + rétention 7j + 1 mensuel |
| 13.6 | Monitoring basique | P1 | M | Healthchecks, logs structurés, alertes Discord |

---

## Backlog futur (Post-MVP)

### Epic 14 : Import avancé
| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 14.1 | Parser OFX | P2 | M | Support format Open Financial Exchange |
| 14.2 | Parser QIF | P2 | M | Support format Quicken Interchange |
| 14.3 | Import récurrent programmé | P3 | L | Upload automatique depuis un dossier/email |

### Epic 15 : Fonctionnalités avancées
| # | Ticket | Priorité | Taille | Description |
|---|--------|----------|--------|-------------|
| 15.1 | Multi-devises avec taux | P2 | L | Conversion automatique via API de taux de change |
| 15.2 | Export PDF rapports | P2 | L | Génération de rapports mensuels en PDF |
| 15.3 | Notifications email | P3 | M | Alertes budget, rapports hebdomadaires |
| 15.4 | Open Banking (DSP2) | P3 | XL | Connexion directe aux banques via API |
| 15.5 | App mobile (PWA) | P3 | XL | Progressive Web App pour consultation mobile |
| 15.6 | Budgets | P2 | L | Définition de budgets par catégorie, alertes de dépassement |
| 15.7 | Partage de comptes | P3 | L | Comptes partagés entre utilisateurs (couple, famille) |

---

## Résumé par sprint

| Sprint | Semaines | Epics | Nb tickets | Focus |
|--------|----------|-------|------------|-------|
| 1 | 1-2 | Setup + Auth | 14 | Fondations, authentification |
| 2 | 3-4 | Comptes + Transactions + Import | 17 | Données de base, import CSV/Excel |
| 3 | 5-6 | Catégorisation + Dashboard | 14 | Classification IA, visualisations |
| 4 | 7-8 | Analyses + Chat IA | 10 | Analyses avancées, assistant IA |
| 5 | 9-10 | Polish + Déploiement | 12 | Qualité, sécurité, production |
| **Total MVP** | **10 semaines** | **13 epics** | **67 tickets** | |

---

## Définition of Done (DoD)

Un ticket est considéré terminé quand :
- [ ] Le code est écrit et respecte les conventions du projet
- [ ] Les tests sont écrits et passent (backend: pytest, frontend: vitest)
- [ ] Le linting passe sans erreur (ruff pour Python, eslint pour TypeScript)
- [ ] Le code est reviewé (ou auto-reviewé pour un développeur solo)
- [ ] La fonctionnalité est testée manuellement
- [ ] La documentation API est à jour (auto-générée via FastAPI)
- [ ] Pas de régression sur les fonctionnalités existantes
