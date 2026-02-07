# MyFinance — Troubleshooting

Guide de résolution des problèmes rencontrés pendant le développement.

---

## Sommaire

1. [401 Unauthorized sur les routes API depuis le frontend](#1-401-unauthorized-sur-les-routes-api-depuis-le-frontend)
2. [passlib / bcrypt incompatible avec Python 3.13](#2-passlib--bcrypt-incompatible-avec-python-313)
3. [SQLAlchemy : relation "xxx" does not exist](#3-sqlalchemy--relation-xxx-does-not-exist)
4. [alembic : ModuleNotFoundError: No module named 'app'](#4-alembic--modulenotfounderror-no-module-named-app)
5. [make : command not found (alembic, uvicorn, ruff...)](#5-make--command-not-found-alembic-uvicorn-ruff)
6. [Frontend : écran "Chargement..." infini (deadlock auth)](#6-frontend--écran-chargement-infini-deadlock-auth)

---

## 1. 401 Unauthorized sur les routes API depuis le frontend

### Symptôme
- L'appel `GET /api/v1/accounts` depuis le frontend retourne **401 Unauthorized**
- Le header `Authorization: Bearer ...` est **absent** de la requête
- Pourtant, `GET /api/v1/users/me` fonctionne correctement

### Cause
FastAPI avec `redirect_slashes=True` (défaut) renvoie un **307 Temporary Redirect** de
`/api/v1/accounts` vers `/api/v1/accounts/` quand la route est définie avec `@router.get("/")`.

Le proxy Vite (`localhost:3000 → localhost:8000`) transmet la requête, mais quand le
navigateur suit le redirect 307, il pointe directement vers `localhost:8000` (cross-origin).
Les navigateurs **suppriment le header `Authorization`** sur les redirects cross-origin
(spécification Fetch, section 4.5).

### Solution
1. **Désactiver les redirects trailing slash** dans FastAPI :
   ```python
   app = FastAPI(..., redirect_slashes=False)
   ```
2. **Utiliser `""` au lieu de `"/"` pour les routes collection** :
   ```python
   # ❌ Mauvais — provoque un redirect
   @router.get("/")
   
   # ✅ Bon — pas de redirect
   @router.get("")
   ```

### Fichiers impactés
- `backend/app/main.py` — `redirect_slashes=False`
- `backend/app/api/v1/accounts.py`
- `backend/app/api/v1/transactions.py`
- `backend/app/api/v1/categories.py`

---

## 2. passlib / bcrypt incompatible avec Python 3.13

### Symptôme
```
ValueError: password cannot be longer than 72 bytes, truncate manually if necessary
```

### Cause
`passlib` n'est plus maintenu et ne gère pas correctement `bcrypt >= 4.1` qui lève
désormais une erreur au lieu de tronquer silencieusement les mots de passe > 72 octets.

### Solution
Utiliser `bcrypt` directement, sans `passlib` :
```python
import bcrypt

def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
```

### Fichier impacté
- `backend/app/core/security.py`

---

## 3. SQLAlchemy : relation "xxx" does not exist

### Symptôme
```
UndefinedTableError: relation "conversations" does not exist
```

### Cause
Le modèle `User` avait `lazy="selectin"` sur ses relationships (`accounts`, `categories`,
`conversations`). SQLAlchemy tente un eager-load de ces tables à chaque `SELECT` sur `users`,
même si les tables n'existent pas encore (migrations pas encore appliquées).

### Solution
Utiliser `lazy="select"` (lazy loading par défaut) au lieu de `lazy="selectin"` :
```python
accounts = relationship("Account", back_populates="user", lazy="select")
```

### Fichier impacté
- `backend/app/models/user.py`
- `backend/app/models/account.py`

---

## 4. alembic : ModuleNotFoundError: No module named 'app'

### Symptôme
```
ModuleNotFoundError: No module named 'app'
```

### Cause
`migrations/env.py` importe `from app.config import settings` mais le répertoire `backend/`
n'est pas dans `sys.path` quand Alembic est exécuté.

### Solution
Ajouter le répertoire parent au début de `migrations/env.py` :
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

### Fichier impacté
- `backend/migrations/env.py`

---

## 5. make : command not found (alembic, uvicorn, ruff...)

### Symptôme
```
/bin/sh: alembic: command not found
```

### Cause
Les outils Python sont installés dans le virtualenv (`backend/venv/bin/`) mais le Makefile
ne l'active pas.

### Solution
Référencer les binaires du venv directement dans le Makefile :
```makefile
VENV := backend/venv/bin
ALEMBIC := $(VENV)/alembic
UVICORN := $(VENV)/uvicorn
```

### Fichier impacté
- `Makefile`
- `scripts/dev.sh`
- `scripts/test.sh`

---

## 6. Frontend : écran "Chargement..." infini (deadlock auth)

### Symptôme
La page affiche indéfiniment un spinner "Chargement..." sans jamais montrer login ou dashboard.

### Cause
**Deadlock chicken-and-egg :**
1. `GuestGuard` vérifie `isLoading` depuis le store Zustand → si `true`, affiche spinner
2. La logique qui met `isLoading=false` était dans le hook `useAuth()` (dans LoginPage)
3. Mais `GuestGuard` empêche le montage de `LoginPage` tant que `isLoading=true`
4. → `isLoading` reste `true` pour toujours

### Solution
Extraire la restauration de session dans un `AuthProvider` global qui s'exécute **au-dessus**
du router, dans `main.tsx` :
```tsx
<AuthProvider>
  <App />
</AuthProvider>
```

`AuthProvider` vérifie le token, appelle `/users/me`, et met `isLoading=false` **avant**
que les Guards ne soient évalués.

### Fichiers impactés
- `frontend/src/components/auth/AuthProvider.tsx` (créé)
- `frontend/src/main.tsx`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/auth/AuthGuard.tsx`
- `frontend/src/components/auth/GuestGuard.tsx`
