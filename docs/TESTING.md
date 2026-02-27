# Testing

## Prérequis

- **PostgreSQL 16** avec l'extension **pgvector**
- **Python 3.11+** avec les dépendances backend installées

```bash
# Installer pgvector (Ubuntu/Debian)
sudo apt install postgresql-16-pgvector

# Installer les dépendances Python
cd backend
pip install -r requirements.txt
```

## Base de données de test

Les tests utilisent la même base que le développement (`myfinance` par défaut).
Pour configurer une DB dédiée, surcharger `DATABASE_URL` dans `backend/.env` :

```bash
# Créer l'utilisateur et la base (si pas encore fait)
sudo -u postgres psql -c "CREATE USER myfinance WITH PASSWORD 'myfinance' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE myfinance OWNER myfinance;"

# Appliquer les migrations
cd backend
alembic upgrade head
```

> **Isolation** : chaque test nettoie ses données après exécution (DELETE).
> Aucune donnée de test ne persiste en base.

## Lancer les tests

```bash
cd backend

# Tous les tests
pytest

# Avec détail
pytest -v

# Un seul fichier
pytest tests/test_evol002_import_tracking.py -v

# Un seul test
pytest tests/test_evol002_import_tracking.py::test_file_stored_on_preview -v

# Avec couverture
pytest --cov=app --cov-report=term-missing
```

## Structure des tests

```
backend/tests/
├── conftest.py                        # Fixtures partagées (db, test_user, test_account)
├── test_health.py                     # Tests API santé (nécessite sentence_transformers)
└── test_evol002_import_tracking.py    # 14 tests d'acceptance EVOL-002
```

### Fixtures principales (`conftest.py`)

| Fixture        | Description                                                    |
|----------------|----------------------------------------------------------------|
| `db`           | Session SQLAlchemy async avec cleanup automatique              |
| `test_user`    | Utilisateur de test (`test-evol002@myfinance.local`)           |
| `test_account` | Compte bancaire de test lié au `test_user`                     |
| `client`       | Client HTTP async (skip si `sentence_transformers` absent)     |

### Données de test

Définies dans `conftest.py` :

- `SAMPLE_CSV_CONTENT` — 5 transactions CSV (boulangerie, pharmacie, salaire, loyer, Netflix)
- `SAMPLE_CSV_CONTENT_OVERLAP` — 2 lignes dont 1 doublon de `SAMPLE_CSV_CONTENT`

## Tests EVOL-002 — Import tracking

14 tests d'acceptance couvrant le workflow d'import deux phases :

| Test                                   | Critère | Vérifie                                              |
|----------------------------------------|---------|------------------------------------------------------|
| `test_file_stored_on_preview`          | AC1     | Fichier stocké dans `{DATA_DIR}/imports/{user}/`     |
| `test_import_log_file_metadata`        | AC2     | ImportLog a filePath, fileSize, fileHash (SHA-256)    |
| `test_transaction_has_import_log_id`   | AC3     | Chaque transaction a `import_log_id`                 |
| `test_every_row_has_import_row`        | AC4     | Chaque ligne du fichier a un ImportRow               |
| `test_duplicate_rows_record_duplicate_of_id` | AC5 | Doublons ont `duplicate_of_id` → transaction existante |
| `test_force_import_duplicate_row`      | AC8     | Import forcé d'une ligne doublon via `forced_row_ids` |
| `test_forced_row_unique_dedup_hash`    | AC9     | Hash unique `{sha256}_forced_{row_id}`               |
| `test_file_downloadable`              | AC12    | Fichier original re-téléchargeable                   |
| `test_reimport_same_file_warning`      | AC13    | `file_already_imported=True` si même hash            |
| `test_cancel_import`                   | AC14    | Annulation → `status=cancelled`, données préservées  |
| `test_import_history_lists_imports`    | —       | Historique liste les imports avec résumés             |
| `test_import_detail_shows_all_rows`    | —       | Vue détaillée avec toutes les lignes et statuts      |
| `test_cannot_confirm_twice`            | —       | Double confirmation → `ValidationError`              |
| `test_cannot_cancel_after_confirm`     | —       | Annulation post-confirm → `ValidationError`          |

## Écrire de nouveaux tests

```python
# backend/tests/test_my_feature.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_something(db: AsyncSession, test_user, test_account):
    """Description du test."""
    # db est une session async, nettoyée automatiquement
    # test_user et test_account sont créés pour chaque test
    ...
```

### Notes techniques

- **pytest-asyncio** en mode `auto` : pas besoin de `@pytest.mark.asyncio` si configuré dans `pyproject.toml`
- **NullPool** : chaque test crée sa propre connexion (pas de conflit d'event loop asyncpg)
- **Cleanup par DELETE** : les tests nettoient en ordre FK (`import_rows` → `transactions` → `import_logs` → `accounts` → `users`)
- **Fichiers générés** : les tests créent des fichiers dans `backend/data/` (gitignored)
