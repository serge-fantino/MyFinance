# MyFinance — Clusters et Classification : Specs et Corrections

> Version 1.0 — Fevrier 2026

---

## 1. Concepts fondamentaux

### 1.1 Glossaire

| Concept | Description | Table |
|---------|-------------|-------|
| **Transaction** | Operation bancaire individuelle (date, montant, libelle) | `transactions` |
| **Categorie** | Rubrique de depense/revenu (Alimentation, Transport...) | `categories` |
| **Regle de classification** | Motif textuel qui assigne automatiquement une categorie aux transactions correspondantes | `classification_rules` |
| **Cluster (persistant)** | Regroupement nomme de transactions similaires, avec statistiques calculees | `transaction_clusters` |
| **Proposition de classification** | Resultat temporaire du clustering par embeddings, soumis a validation utilisateur | `classification_proposals` + `classification_proposal_clusters` |

### 1.2 Invariants du systeme

1. **Un cluster est independant d'une regle** : un cluster peut exister sans regle associee. La regle peut etre ajoutee ulterieurement.
2. **La classification unitaire est simple** : classifier manuellement une transaction = assigner sa categorie, sans creer de regle ni de cluster.
3. **Les clusters de regles sont uniques** : quand `apply_rules` est execute, les nouvelles transactions matchees sont fusionnees dans le cluster existant de la regle (pas de doublon).
4. **L'utilisateur controle** : aucune classification automatique par embeddings. Le systeme propose, l'utilisateur dispose.

---

## 2. Les trois sources de clusters

### 2.1 Cluster "rule" (source d'une regle)

**Quand** : `apply_rules` execute une regle qui matche des transactions non classees.

**Comportement actuel (BUG)** : Chaque execution de `apply_rules` cree un NOUVEAU cluster pour chaque regle qui matche, meme si un cluster existe deja pour cette regle. Cela cree des doublons.

**Comportement correct** :
1. Pour chaque regle qui matche des transactions :
   - Chercher un cluster existant avec `rule_id = rule.id`
   - Si trouve : ajouter les nouvelles transactions a `transaction_ids`, mettre a jour `transaction_count`, recomputer les statistiques
   - Si non trouve : creer un nouveau cluster lie a la regle
2. Le cluster herite de la regle : `rule_pattern`, `match_type`, `category_id`, `name = custom_label || pattern`

**Relation regle/cluster** :
- `TransactionCluster.rule_id` (FK optionnel vers `classification_rules`)
- Pas de contrainte UNIQUE sur `rule_id` (car un cluster peut ne pas avoir de regle)
- Mais dans la pratique, un cluster de source "rule" devrait avoir un `rule_id` unique

### 2.2 Cluster "classification" (depuis une proposition embedding)

**Quand** : L'utilisateur accepte un cluster de proposition depuis la page Classification.

**Deux actions possibles** :
1. **"Appliquer"** (`apply_cluster`) : Classifie les transactions (assigne la categorie) + cree une regle + cree un cluster persistant
2. **"Sauvegarder en cluster"** (`create_from_proposal`) : Cree un cluster persistant SANS classifier les transactions et SANS creer de regle. La regle peut etre ajoutee plus tard via la page Clusters (dialog "Config de detection").

**Comportement** :
- Le cluster persistant a `source = "classification"` et `proposal_cluster_id` pointant vers le cluster de proposition d'origine
- Quand "Appliquer" : `category_id` est defini, `rule_pattern` et `match_type` sont copies
- Quand "Sauvegarder" : `category_id` peut etre null, pas de regle creee

### 2.3 Cluster "manual" (selection manuelle)

**Quand** : L'utilisateur selectionne des transactions dans la page Clusters et cree un nouveau cluster.

**Comportement** :
- `source = "manual"`
- Peut optionnellement creer une regle (checkbox dans le dialog)
- Retire les transactions des clusters sources si necessaire

---

## 3. Classification manuelle d'une transaction

### 3.1 Comportement actuel (A CORRIGER)

Quand l'utilisateur modifie la categorie d'une transaction via `PATCH /transactions/{id}` :
1. `ai_confidence` = "user"
2. **Cree automatiquement une regle** (`create_rule = true` par defaut dans `TransactionUpdate`)
3. **Applique immediatement la regle** a toutes les transactions non classees similaires

### 3.2 Comportement voulu

La classification manuelle d'UNE transaction doit etre simple :
- Assigner la categorie a la transaction
- `ai_confidence` = "user"
- **Pas de creation de regle**
- **Pas de cluster**
- Le champ `create_rule` dans `TransactionUpdate` doit etre `False` par defaut

L'utilisateur qui veut creer une regle le fait explicitement via la page Regles ou via le dialog de detection dans la page Clusters.

---

## 4. Corrections de code requises

### 4.1 BUG CRITIQUE : `apply_rules` cree des clusters doublons

**Fichier** : `backend/app/services/rule_service.py`, methode `apply_rules`

**Probleme** : Lignes 172-189 — Pour chaque regle qui matche des transactions, `create_cluster()` est appele inconditionnellement, creant un nouveau cluster a chaque fois.

**Correction** :
```python
# Pour chaque regle qui a matche des transactions
for rule in rules:
    matched_ids = rule_matches.get(rule.id, [])
    if not matched_ids:
        continue

    # Chercher un cluster existant pour cette regle
    existing_cluster = await self.db.execute(
        select(TransactionCluster).where(
            TransactionCluster.user_id == user.id,
            TransactionCluster.rule_id == rule.id,
        )
    )
    existing = existing_cluster.scalar_one_or_none()

    if existing:
        # Fusionner les nouvelles transactions dans le cluster existant
        current_ids = set(existing.transaction_ids or [])
        new_ids = current_ids | set(matched_ids)
        await cluster_service.update_cluster(
            user=user,
            cluster_id=existing.id,
            transaction_ids=list(new_ids),
        )
    else:
        # Creer un nouveau cluster
        cluster_name = rule.custom_label or rule.pattern
        await cluster_service.create_cluster(
            user=user,
            name=cluster_name,
            transaction_ids=matched_ids,
            account_id=account_id,
            category_id=rule.category_id,
            source="rule",
            rule_id=rule.id,
            rule_pattern=rule.pattern,
            match_type=rule.match_type,
        )
```

### 4.2 Classification unitaire : changer le defaut de `create_rule`

**Fichier** : `backend/app/schemas/transaction.py`

**Changement** :
```python
class TransactionUpdate(BaseModel):
    ...
    create_rule: bool = False  # Etait True, maintenant False par defaut
```

### 4.3 Code duplique : `_matches()` dans RuleService et ClusterService

**Probleme** : La methode `_matches()` est identique dans `RuleService` et `ClusterService`.

**Correction** : Extraire dans un module utilitaire `backend/app/utils/pattern_matching.py` et importer dans les deux services.

```python
# backend/app/utils/pattern_matching.py
import re

def matches_pattern(label: str, pattern: str, match_type: str) -> bool:
    """Check if a transaction label matches a rule pattern."""
    ...
```

---

## 5. Pipeline de classification complet

### 5.1 Apres un import

```
1. Parsing des libelles     → extrait counterparty, mode paiement, etc.
2. Application des regles   → classifie + fusionne dans les clusters existants
3. Calcul des embeddings    → vectorise les transactions non classees
4. (Optionnel) Recalcul de la proposition de classification
```

### 5.2 Page Classification (workflow utilisateur)

```
1. Selectionner un compte
2. Cliquer "Analyser" → parse, applique regles, calcule embeddings, cree les clusters de proposition
3. Pour chaque cluster de proposition :
   a. "Appliquer" → classifie les transactions + cree regle + cree cluster persistant
   b. "Sauvegarder en cluster" → cree cluster persistant (sans classifier ni creer de regle)
   c. "Ignorer" → aucune action
```

### 5.3 Page Clusters (gestion des clusters persistants)

```
- Voir tous les clusters avec statistiques
- Modifier le nom, la description, la categorie
- Ajouter une config de detection (pattern + match_type) → peut creer une regle
- Deplacer des transactions entre clusters
- Creer un cluster a partir d'une selection
- Recalculer les statistiques
```

### 5.4 Classification manuelle (page Transactions)

```
- Modifier la categorie d'une transaction → juste la categorie, pas de regle ni cluster
```

---

## 6. Schema de donnees

### 6.1 Relations

```
classification_rules (1) ←────── (0..1) transaction_clusters
        ↑                                    ↑
        │ rule_id (FK optionnel)             │ cluster_id (FK optionnel)
        │                                    │
        └────────────────────────────────────┤
                                             │
classification_proposal_clusters (0..1) ←────┘ proposal_cluster_id (FK optionnel)
        ↑
        │ proposal_id (FK)
        │
classification_proposals (1 par user+account)
```

### 6.2 TransactionCluster — champs cles

| Champ | Type | Description |
|-------|------|-------------|
| `source` | string | "rule", "classification", "manual" |
| `rule_id` | FK nullable | Lien vers la regle de classification |
| `proposal_cluster_id` | FK nullable | Lien vers le cluster de proposition d'origine |
| `rule_pattern` | string nullable | Motif de detection (copie ou saisie manuelle) |
| `match_type` | string nullable | Type de correspondance du motif |
| `category_id` | FK nullable | Categorie assignee au cluster |
| `transaction_ids` | JSONB | Liste des IDs de transactions (denormalisee) |

### 6.3 Transaction — lien avec le cluster

| Champ | Type | Description |
|-------|------|-------------|
| `cluster_id` | FK nullable | Le cluster auquel cette transaction appartient |
| `category_id` | FK nullable | Categorie (assignee par regle, embedding, ou manuellement) |
| `ai_confidence` | string | "rule", "user", "embedding", "high", "medium", "low" |

---

## 7. Resume des changements a implementer

| # | Priorite | Description | Fichier(s) |
|---|----------|-------------|------------|
| 1 | **CRITIQUE** | `apply_rules` : fusionner avec le cluster existant au lieu d'en creer un nouveau | `rule_service.py` |
| 2 | **IMPORTANT** | `TransactionUpdate.create_rule` : defaut `False` au lieu de `True` | `transaction.py` (schema) |
| 3 | **NICE-TO-HAVE** | Extraire `_matches()` dans un module partage | `pattern_matching.py` (nouveau) |
