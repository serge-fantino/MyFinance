# MyFinance — Stratégie de Classification par Embeddings

> Version 1.0 — Février 2026

---

## 1. Contexte et objectifs

### 1.1 Problème

La classification automatique des transactions bancaires repose actuellement sur deux mécanismes :
- **Règles de correspondance textuelles** (`contains`, `exact`, `starts_with`) — rapides mais fragiles, ne gèrent pas les variations de libellés
- **Classification IA (OpenAI)** — flexible mais dépendante d'une API externe, coûteuse, et avec latence réseau

Les libellés bancaires présentent des défis spécifiques :
- Variations d'un même marchand : `"AMAZON PRIME FR"`, `"AMAZON.FR MARKETPLACE"`, `"AMZN MKTP FR"`
- Abréviations et codes : `"VIR SEPA CPAM"`, `"CB LECLERC 25/01"`
- Bruit : dates, numéros de carte, codes d'opération mélangés au libellé utile

### 1.2 Objectifs

1. **Regrouper** automatiquement les transactions similaires (même origine, même type) sans écrire de règles manuelles
2. **Proposer** une classification par défaut à l'utilisateur, basée sur :
   - Les transactions déjà classées par l'utilisateur (apprentissage par similarité)
   - La sémantique a priori des catégories (projection dans l'espace d'embeddings)
3. **Laisser le choix** : l'utilisateur valide ou rejette chaque suggestion
4. **Scalabilité** : supporter plusieurs milliers de transactions sans GPU ni API externe

### 1.3 Principes directeurs

- L'utilisateur garde **toujours le contrôle** : aucune classification n'est appliquée automatiquement
- Le système **propose**, l'utilisateur **dispose**
- Les suggestions sont basées sur des **similarités mesurables** et explicables
- Tout tourne **localement**, sans dépendance à une API cloud

---

## 2. Architecture technique

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                    Import / Saisie de transaction                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Moteur de règles (existant, inchangé)                        │
│     Pattern matching sur label_raw → catégorie                   │
│     Rapide, déterministe, priorité haute                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Transactions non classées restantes
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Calcul d'embedding (sentence-transformers, local CPU)        │
│                                                                  │
│     Input : label_raw + signe du montant (income/expense)        │
│     Modèle : paraphrase-multilingual-MiniLM-L12-v2 (384 dims)   │
│     Stockage : colonne Vector(384) via pgvector dans PostgreSQL  │
│                                                                  │
│     Performance : ~5ms/transaction sur CPU → 5000 txns ≈ 25s     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
┌──────────────────────────┐  ┌───────────────────────────────────┐
│  3a. Suggestion par       │  │  3b. Clustering HDBSCAN            │
│      voisinage            │  │                                    │
│                           │  │  Regroupe les transactions non     │
│  Pour chaque transaction  │  │  classées par similarité           │
│  non classée, cherche les │  │                                    │
│  K plus proches voisins   │  │  Chaque cluster = un groupe de     │
│  CLASSÉS par l'utilisateur│  │  transactions similaires avec :    │
│                           │  │  - Un label représentatif          │
│  Si similarité > seuil :  │  │  - Un nombre de transactions       │
│  → suggère la catégorie   │  │  - Une catégorie suggérée          │
│  du voisin le plus proche │  │    (par voisinage ou sémantique)   │
└──────────────────────────┘  └───────────────────────────────────┘
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Suggestion par sémantique des catégories                     │
│                                                                  │
│  Les catégories sont aussi projetées dans l'espace d'embeddings  │
│  "Dépenses > Alimentation" → vecteur 384d                       │
│  "Revenus > Salaire" → vecteur 384d                             │
│                                                                  │
│  Si aucun voisin classé n'est assez proche :                     │
│  → compare l'embedding de la transaction aux embeddings          │
│    des catégories → suggestion "sémantique"                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Présentation à l'utilisateur                                 │
│                                                                  │
│  Vue clusters :                                                  │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ Cluster "AMAZON" (15 transactions)                   │        │
│  │ Suggestion : Shopping (confiance 87%)                │        │
│  │ Exemples : AMAZON PRIME FR, AMAZON.FR MARKETPLACE   │        │
│  │ [✓ Appliquer]  [✎ Modifier catégorie]  [✗ Ignorer]  │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
│  L'utilisateur peut :                                            │
│  - Accepter la suggestion → applique + crée une règle            │
│  - Modifier la catégorie → applique la bonne + crée une règle    │
│  - Ignorer → ne fait rien                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Modèle d'embedding

**Choix : `paraphrase-multilingual-MiniLM-L12-v2`**

| Critère | Valeur |
|---------|--------|
| Dimensions | 384 |
| Taille du modèle | ~130 MB |
| Langues supportées | 50+ (dont français) |
| Vitesse CPU | ~5 ms/phrase |
| Qualité (STS benchmark) | 0.837 (multilingual) |
| Licence | Apache 2.0 |

**Pourquoi ce modèle :**
- Multilingual natif → gère les libellés bancaires français
- Très petit → se charge en mémoire sans problème
- Rapide sur CPU → pas besoin de GPU
- Bonne qualité de similarité sémantique

**Input enrichi :**
Pour améliorer la qualité des embeddings, le texte d'entrée combine :
```
"{label_raw} [{direction}]"
```
Exemples :
- `"AMAZON PRIME FR [expense]"` → embedding
- `"VIR SEPA SALAIRE [income]"` → embedding

Le tag `[income]`/`[expense]` aide le modèle à distinguer les virements de nature différente.

### 2.3 Stockage (pgvector)

Les embeddings sont stockés directement dans la table `transactions` via l'extension PostgreSQL `pgvector` :

```sql
-- Nouvelle colonne sur transactions
ALTER TABLE transactions ADD COLUMN embedding vector(384);

-- Index pour la recherche de similarité (optionnel, utile > 10k lignes)
CREATE INDEX idx_transactions_embedding ON transactions
  USING hnsw (embedding vector_cosine_ops);
```

**Avantages de pgvector :**
- Recherche de similarité en SQL natif : `ORDER BY embedding <=> $1 LIMIT 10`
- Support des index HNSW pour la performance à grande échelle
- Pas de service externe (pas de Pinecone, Weaviate, etc.)
- S'intègre naturellement dans l'architecture PostgreSQL existante

### 2.4 Embeddings des catégories

Les catégories sont aussi projetées dans l'espace d'embeddings pour permettre une suggestion sémantique a priori (sans données d'entraînement utilisateur).

**Texte embedé pour chaque catégorie :**
```
"{parent_name} > {category_name}"
```
Exemples :
- `"Revenus > Salaire"` → embedding
- `"Dépenses > Alimentation"` → embedding
- `"Dépenses > Transport"` → embedding
- `"Transferts > Virement entre comptes"` → embedding

Les embeddings de catégories sont calculés à la demande et mis en cache en mémoire.

---

## 3. Algorithmes

### 3.1 Calcul de similarité

**Métrique : distance cosinus**

```
cosine_similarity(a, b) = (a · b) / (‖a‖ × ‖b‖)
```

- 1.0 = identique
- 0.0 = aucun rapport
- Seuils de confiance :

| Similarité | Confiance | Interprétation |
|-----------|-----------|----------------|
| ≥ 0.85 | `high` | Même marchand/type |
| ≥ 0.70 | `medium` | Probablement même catégorie |
| ≥ 0.55 | `low` | Potentiellement lié |
| < 0.55 | — | Pas de suggestion |

### 3.2 Suggestion par voisinage (k-NN)

Pour chaque transaction non classée :

1. Trouver les K=5 transactions **classées** les plus proches par cosine similarity
2. Si le plus proche a une similarité ≥ seuil :
   - Utiliser la catégorie la plus fréquente parmi les K voisins
   - Pondérer par la similarité (voisins plus proches pèsent plus)
   - Confiance = similarité du voisin le plus proche
3. Si aucun voisin classé assez proche → fallback sur la suggestion sémantique

### 3.3 Suggestion par sémantique des catégories

Pour les transactions sans voisin classé suffisamment proche :

1. Comparer l'embedding de la transaction à chaque embedding de catégorie
2. Trouver la catégorie la plus proche
3. Si la similarité ≥ 0.40 (seuil plus bas car les catégories sont des concepts abstraits) :
   - Suggérer cette catégorie
   - Confiance = basée sur la similarité, plafonnée à `medium`

### 3.4 Clustering (HDBSCAN)

Pour regrouper les transactions similaires et présenter des clusters à l'utilisateur :

1. Extraire les embeddings de toutes les transactions non classées
2. Calculer la matrice de distance cosinus
3. Appliquer HDBSCAN avec :
   - `min_cluster_size=3` (au moins 3 transactions par cluster)
   - `min_samples=2`
   - `metric="precomputed"` (sur la matrice de distances)
4. Pour chaque cluster trouvé :
   - Calculer le centroïde (moyenne des embeddings)
   - Trouver le label le plus fréquent (label représentatif)
   - Appliquer suggestion par voisinage sur le centroïde
   - Si pas de voisin → suggestion par sémantique des catégories
5. Trier les clusters par nombre de transactions (décroissant)

**Pourquoi HDBSCAN :**
- Pas besoin de spécifier le nombre de clusters
- Gère les clusters de densité variable
- Identifie le bruit (transactions isolées)
- Disponible dans scikit-learn ≥ 1.3

---

## 4. Pipeline de classification

### 4.1 Ordre d'exécution (après import)

```
1. Règles utilisateur     → classification déterministe (existant)
2. Calcul d'embeddings    → pour les nouvelles transactions (nouveau)
3. Suggestion par voisinage → basée sur les transactions classées (nouveau)
   → Les suggestions ne sont PAS appliquées automatiquement
   → Elles sont stockées et présentées à l'utilisateur
```

### 4.2 Intégration avec le système existant

Le système d'embeddings **complète** le moteur de règles sans le remplacer :

| Étape | Source | Confiance | Automatique ? |
|-------|--------|-----------|---------------|
| Règle utilisateur | `rule` | haute | Oui |
| ~~Classification OpenAI~~ | ~~`high/medium/low`~~ | ~~variable~~ | ~~Oui~~ |
| Suggestion embedding | `embedding` | variable | **Non** → l'utilisateur valide |

L'intégration OpenAI est **désactivée** au profit des embeddings locaux. Elle pourra être réactivée ultérieurement comme couche complémentaire si nécessaire.

### 4.3 Feedback loop

Quand l'utilisateur accepte une suggestion ou classifie manuellement :
1. La catégorie est appliquée à la transaction (existant)
2. Une règle de classification est créée (existant)
3. L'embedding de cette transaction sert désormais de référence pour les suggestions futures (automatique via voisinage)

Le cercle vertueux : plus l'utilisateur classifie → plus les suggestions sont précises → moins l'utilisateur a à classifier.

---

## 5. API

### 5.1 Nouveaux endpoints

```
POST /api/v1/transactions/compute-embeddings
  → Calcule les embeddings manquants pour les transactions de l'utilisateur
  → Query params : account_id (optionnel)
  → Réponse : { computed: int, skipped: int, total: int }

GET /api/v1/transactions/clusters
  → Retourne les clusters de transactions non classées avec suggestions
  → Query params : account_id (optionnel), min_cluster_size (défaut 3)
  → Réponse : { clusters: [...], unclustered_count: int, total_uncategorized: int }

POST /api/v1/transactions/clusters/classify
  → Classifie un groupe de transactions (cluster ou sélection libre)
  → Body : { transaction_ids: [int], category_id: int, create_rule: bool,
             rule_pattern: str?, custom_label: str? }
  → Réponse : { classified_count: int, rule_created: bool }
```

### 5.2 Modification du pipeline d'import

Le endpoint `POST /transactions/import` est modifié :
1. Import des transactions (inchangé)
2. Application des règles (inchangé)
3. ~~Classification OpenAI~~ → **Calcul des embeddings** (nouveau)
4. Les suggestions sont disponibles via `GET /transactions/clusters`

---

## 6. Dépendances

### 6.1 Python

| Package | Version | Usage |
|---------|---------|-------|
| `sentence-transformers` | ≥ 2.2.0 | Calcul d'embeddings multilingual |
| `pgvector` | ≥ 0.2.0 | Extension SQLAlchemy pour pgvector |
| `scikit-learn` | ≥ 1.3.0 | HDBSCAN clustering |
| `numpy` | ≥ 1.24.0 | Calcul vectoriel (dépendance transitive) |

> Note : `sentence-transformers` inclut PyTorch (CPU) en dépendance. Première installation ~500MB, ensuite le modèle est caché (~130MB).

### 6.2 PostgreSQL

| Extension | Usage |
|-----------|-------|
| `pgvector` | Type `vector`, opérateurs de distance, index HNSW |

L'image Docker est remplacée par `pgvector/pgvector:pg16-alpine` qui est un drop-in replacement de `postgres:16-alpine` avec l'extension pgvector pré-installée.

---

## 7. Performance et limites

### 7.1 Performance attendue

| Opération | Temps (CPU) | Mémoire |
|-----------|------------|---------|
| Chargement du modèle | ~2-5s (première fois) | ~500 MB |
| Embedding d'une transaction | ~5 ms | négligeable |
| Embedding de 1000 transactions (batch) | ~2s | ~50 MB |
| Embedding de 5000 transactions (batch) | ~8s | ~200 MB |
| Clustering HDBSCAN (5000 txns) | ~1-3s | ~150 MB |
| Recherche k-NN (pgvector, 10k rows) | ~5 ms | négligeable |

### 7.2 Limites

- **Mémoire** : le modèle PyTorch occupe ~500 MB en RAM. Acceptable pour un serveur, mais à surveiller sur des machines limitées
- **Premier chargement** : ~2-5s pour charger le modèle → lazy loading recommandé
- **Qualité des embeddings** : les libellés bancaires sont souvent courts et bruités, ce qui peut réduire la qualité. Le tag `[income/expense]` aide mais n'élimine pas toute ambiguïté
- **Seuils statiques** : les seuils de similarité (0.85, 0.70, 0.55) peuvent nécessiter un ajustement selon les données réelles

### 7.3 Évolutions possibles

- **Fine-tuning** : entraîner un modèle spécialisé sur les libellés bancaires français
- **Hybride** : combiner embeddings + OpenAI pour les cas ambigus
- **Index HNSW** : activer l'index pgvector pour les utilisateurs avec > 10k transactions
- **Embeddings incrémentaux** : ne recalculer que les embeddings des nouvelles transactions (déjà implémenté)
