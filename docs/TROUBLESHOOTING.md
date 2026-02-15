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
7. [Ollama non disponible (suggestions LLM)](#7-ollama-non-disponible-suggestions-llm)
8. [Ollama sur Mac M-series : utiliser le GPU (Metal)](#8-ollama-sur-mac-m-series--utiliser-le-gpu-metal)

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

---

## 7. Ollama non disponible (suggestions LLM)

### Symptôme
- Dans la fenêtre Suggestions, le bouton « Interpréter (LLM) » ou les suggestions automatiques renvoient : **« Ollama non disponible »**
- Message du type : « Vérifiez que le service tourne et que le modèle est chargé »

### Cause
Le backend appelle Ollama sur `LLM_BASE_URL` (par défaut `http://localhost:11434`). Soit le conteneur Ollama ne tourne pas, soit le modèle configuré (`LLM_MODEL`, ex. `mistral`) n’a pas été téléchargé dans le conteneur.

### Solution

1. **Démarrer l’infra (y compris Ollama)**  
   ```bash
   make dev-infra
   ```
   Cela lance PostgreSQL, Redis, Adminer et **Ollama**. Vérifier que le service `ollama` est bien « Up » :
   ```bash
   docker compose -f docker-compose.dev.yml ps
   ```

2. **Télécharger le modèle LLM (une fois)**  
   Au premier lancement, le conteneur Ollama ne contient aucun modèle. Utiliser le Makefile :
   ```bash
   make ollama-pull
   ```
   Par défaut cela tire le modèle `mistral`. Pour un autre modèle :
   ```bash
   make ollama-pull LLM_MODEL=llama3.2
   ```
   Cela peut prendre quelques minutes.

3. **Vérifier que Ollama répond**  
   ```bash
   make ollama-status
   ```
   Ou manuellement : `curl http://localhost:11434/api/tags` (réponse JSON listant les modèles).

4. **Vérifier la config**  
   Le backend utilise `backend/.env` : `LLM_BASE_URL` (défaut `http://localhost:11434`), `LLM_MODEL` (défaut `mistral`). Ils doivent correspondre à un modèle présent dans le conteneur.

5. **Afficher le bouton « Interpréter (LLM) »**  
   Par défaut, le bouton LLM est **masqué** dans l’interface pour que l’app fonctionne sans Ollama. Pour l’afficher une fois Ollama opérationnel, définir dans `backend/.env` :
   ```bash
   LLM_UI_ENABLED=true
   ```
   Puis redémarrer le backend.

---

## 8. Ollama sur Mac M-series : utiliser le GPU (Metal)

### Symptôme
- Ollama tourne mais les réponses du LLM sont **très lentes**
- Le conteneur Docker Ollama ne peut pas utiliser le GPU Apple Silicon (Metal)

### Cause
Sous Docker sur Mac, les conteneurs s’exécutent dans une VM Linux. **Le GPU Metal (M1/M2/M3/M4) n’est pas exposé** aux conteneurs, donc Ollama en Docker tourne en CPU uniquement.

### Solution : Ollama en natif sur macOS

Pour utiliser le **GPU Metal** sur Mac Mini M4 (ou autre M-series), il faut faire tourner **Ollama en natif** sur macOS, pas dans Docker. Le backend continue d’appeler `http://localhost:11434` ; il suffit qu’Ollama écoute sur ce port.

1. **Installer Ollama en natif**  
   - Option A : [Télécharger l’app](https://ollama.com/download/mac) (recommandé, lance le service au démarrage)  
   - Option B : `make install-ollama-mac` (script qui fait `brew install --cask ollama`, démarre le service, tire `mistral`)

2. **Lancer le service** (si installé via Homebrew)  
   ```bash
   brew services start ollama
   ```
   Ou en one-shot : `ollama serve` (garder le terminal ouvert).

3. **Télécharger le modèle**  
   ```bash
   ollama pull mistral
   ```
   (Ou le modèle configuré dans `LLM_MODEL`.)

4. **Ne pas lancer le conteneur Ollama**  
   Si tu utilises Ollama en natif, lance uniquement db/redis/adminer :
   ```bash
   docker compose -f docker-compose.dev.yml up -d db redis adminer
   ```
   (Le service `ollama` n’est plus dans le docker-compose ; tout se fait en natif.)

5. **Vérifier que Ollama répond**  
   `curl http://localhost:11434/api/tags` doit lister les modèles. Le backend MyFinance utilisera ce Ollama sur 11434.

6. **Vérifier que Metal (GPU) est utilisé**  
   Sur Apple Silicon, Metal est en général utilisé **par défaut**. Pour confirmer :
   ```bash
   make ollama-verify-metal
   ```
   Le script envoie un petit prompt, puis cherche « metal » dans les logs Ollama (`~/.ollama/logs/server.log` ou `~/Library/Logs/Ollama/server.log`). Si Metal n’apparaît pas et que les réponses sont lentes, forcer le backend Metal (étape 7).

7. **Forcer Metal si les réponses restent lentes**  
   Quitter l’app Ollama (menu Ollama → Quit), puis dans un terminal :
   ```bash
   OLLAMA_LLM_LIBRARY=metal ollama serve
   ```
   Garder ce terminal ouvert ; le backend MyFinance continuera d’appeler `localhost:11434`. Pour que ce réglage persiste au démarrage avec `brew services`, définir la variable dans l’environnement du service (ex. `launchctl setenv OLLAMA_LLM_LIBRARY metal` puis redémarrer Ollama) ou lancer `ollama serve` manuellement avec la variable.

Résumé : **Ollama en natif sur Mac = Metal utilisé par défaut** ; **Ollama en Docker sur Mac = CPU seulement**. Vérifier avec `make ollama-verify-metal`.
