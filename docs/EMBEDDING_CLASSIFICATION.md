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
   - Les transactions déjà classées par l'utilisateur (apprentissage par similarité k-NN)
   - Un LLM local (Ollama + Mistral) pour le cold-start et les cas ambigus
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
│  0. Parsing du libellé (label_parser, regex classique)           │
│                                                                  │
│     Extrait des métadonnées structurées depuis label_raw :       │
│     - Mode de paiement (CB, VIR SEPA, PRLV, etc.)               │
│     - Tiers / contrepartie (nom du marchand)                     │
│     - Identifiant carte (CARTE 4974XXXXXXXX3769)                 │
│     - Date d'opération (si présente dans le libellé)             │
│                                                                  │
│     Stockage : colonne parsed_metadata (JSONB) sur transactions  │
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
│     Input : counterparty (tiers nettoyé) + [income/expense]      │
│     Fallback : label_raw si pas de counterparty détecté          │
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
│  3a. Suggestion k-NN      │  │  3b. Clustering                    │
│      (voisinage)          │  │      AgglomerativeClustering       │
│                           │  │                                    │
│  Pour chaque transaction  │  │  Regroupe les transactions non     │
│  non classée, cherche les │  │  classées par similarité cosinus   │
│  K plus proches voisins   │  │                                    │
│  CLASSÉS par l'utilisateur│  │  Chaque cluster = un groupe de     │
│                           │  │  transactions similaires avec :    │
│  Si similarité > seuil :  │  │  - Un label représentatif          │
│  → suggère la catégorie   │  │  - Un nombre de transactions       │
│  du voisin le plus proche │  │  - Une catégorie suggérée          │
└──────────────────────────┘  └───────────────────────────────────┘
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Classification par LLM local (Ollama + Mistral)              │
│                                                                  │
│  Pour les clusters sans match k-NN (cold-start) :               │
│  → Le LLM reçoit le label du cluster + les catégories enrichies │
│    (avec descriptions, mots-clés, exemples de marchands)         │
│  → Retourne : catégorie, confiance, explication                  │
│                                                                  │
│  Le LLM a la connaissance du monde nécessaire pour associer      │
│  "PARK TRIVAUX" à Transport ou "LECLERC" à Alimentation.        │
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

**Input optimisé :**
Le texte d'entrée pour l'embedding utilise le **tiers nettoyé** (counterparty) extrait par le label parser, plutôt que le libellé brut complet. Cela évite que le mode de paiement, les dates et les numéros de carte dominent l'embedding :
```
"{counterparty} [{direction}]"
```
Si aucun tiers n'a pu être extrait, le label_raw complet est utilisé en fallback.

Exemples :
- `"FACTURE CARTE — DU 140126 PARK TRIVAUX BS MEUDON CARTE 4974..."` → **`"PARK TRIVAUX BS MEUDON [expense]"`**
- `"VIREMENT SEPA — CPAM DES HAUTS DE SEINE"` → **`"CPAM DES HAUTS DE SEINE [income]"`**
- `"AMAZON PRIME FR"` (pas de parsing possible) → `"AMAZON PRIME FR [expense]"`

Le tag `[income]`/`[expense]` aide le modèle à distinguer les virements de nature différente.

**Renforcement de mots-clés (optionnel) :**  
Pour donner plus de poids à certains noms (marchands, libellés récurrents), on peut configurer `EMBEDDING_BOOST_KEYWORDS` (liste séparée par des virgules). Chaque mot présent dans le libellé est répété avant le texte envoyé au modèle, ce qui renforce son influence dans l’embedding. Ex. `EMBEDDING_BOOST_KEYWORDS=LECLERC,AMAZON` et `EMBEDDING_BOOST_REPEAT=2` (défaut). Après modification, il faut recalculer les embeddings (bouton Suggestions ou tâche dédiée).

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

### 2.4 Classification LLM locale (Ollama)

Pour le cold-start (aucune transaction classée) et les cas où le k-NN ne suffit pas, un **LLM local** est utilisé via **Ollama**.

**Architecture :**
- **Ollama** tourne comme service Docker (`ollama/ollama:latest`, port 11434)
- **Modèle** : Mistral 7B (configurable via `LLM_MODEL`)
- **Communication** : API HTTP REST (`/api/generate`)
- **Temps de réponse** : ~2-10s par cluster sur CPU

**Prompt structuré :**
Le LLM reçoit un prompt contenant :
1. L'arbre complet des catégories avec des **descriptions enrichies** (mots-clés, exemples de marchands)
2. Le label représentatif du cluster
3. Quelques transactions d'exemple du cluster (label, montant, date)

**Descriptions enrichies des catégories :**
Au lieu d'envoyer simplement "Dépenses > Alimentation", le prompt inclut des descriptions riches :
```
Alimentation — Courses alimentaires, supermarché, épicerie, boulangerie,
restaurant, fast-food, Leclerc, Carrefour, Auchan, Lidl, Monoprix, McDo...

Transport — Essence, carburant, péage, parking, SNCF, RATP, Navigo,
taxi, Uber, entretien auto, Total, Shell, Vinci, autoroute, Indigo...
```

**Réponse attendue :** JSON avec `category_id`, `confidence` (high/medium/low), `explanation`.

**Avantages vs embedding sémantique :**
- Le LLM a la **connaissance du monde** : il sait que "LECLERC" est un supermarché
- Les noms propres de marchands sont correctement classifiés
- L'explication en langage naturel aide l'utilisateur à comprendre la suggestion
- Pas besoin de maintenir une liste exhaustive de marchands

**Fallback gracieux :** si Ollama n'est pas disponible, les clusters restent sans suggestion (l'utilisateur peut toujours choisir manuellement).

**Suggestion par distance à la catégorie la plus proche :**  
Pour proposer une catégorie, on calcule la similarité cosinus entre l’embedding de la transaction (ou du centroïde du cluster) et l’embedding de chaque catégorie feuille, puis on choisit la **catégorie la plus proche** (similarité maximale). Quand cette similarité dépasse `embedding_category_prefer_threshold` (défaut 0,62), cette suggestion est **prioritaire** sur le k-NN des transactions déjà classées, ce qui améliore la cohérence avec le vocabulaire des catégories.

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

### 3.3 Suggestion par LLM local

Pour les clusters sans voisin classé suffisamment proche :

1. Construire un prompt structuré avec le label du cluster, les transactions d'exemple, et les catégories enrichies
2. Envoyer au LLM via Ollama (`POST /api/generate`)
3. Parser la réponse JSON : `{category_id, confidence, explanation}`
4. Valider que le `category_id` existe bien dans la liste des catégories

**Ordre de priorité des stratégies :**
1. **k-NN** (fast path, ~1ms) → quand des transactions classées similaires existent
2. **LLM** (cold-start, ~5s) → quand le k-NN n'a pas de match suffisant
3. **Aucune suggestion** → si le LLM n'est pas disponible ou ne peut pas classifier

### 3.4 Clustering (AgglomerativeClustering)

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
   - Appliquer suggestion par voisinage (k-NN) sur le centroïde
   - Si pas de voisin → suggestion par LLM local
5. Trier les clusters par nombre de transactions (décroissant)

**Note :** L'implémentation utilise `AgglomerativeClustering` (scikit-learn) avec matrice de distance cosinus pré-calculée et un seuil de distance configurable. Cela offre des clusters plus stables que HDBSCAN pour les petits jeux de données.

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
| Suggestion embedding (k-NN) | `embedding` | variable | **Non** → l'utilisateur valide |
| Suggestion LLM local | `llm` | variable | **Non** → l'utilisateur valide |

L'intégration OpenAI est **désactivée** au profit des embeddings + LLM local. Tout tourne localement, sans dépendance à une API cloud.

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
POST /api/v1/transactions/parse-labels
  → Parse les libellés bruts pour extraire les métadonnées structurées
  → Query params : account_id (optionnel), force (défaut false)
  → Réponse : { parsed: int, total: int }

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
2. **Parsing des libellés** → extraction des métadonnées structurées (nouveau)
3. Application des règles (inchangé)
4. ~~Classification OpenAI~~ → **Calcul des embeddings** sur le counterparty nettoyé (nouveau)
5. Les suggestions sont disponibles via `GET /transactions/clusters` (k-NN + LLM)

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

L'image Docker est remplacée par `pgvector/pgvector:pg16` (Debian-based, drop-in replacement de `postgres:16` avec l'extension pgvector pré-installée).

### 6.3 Ollama (LLM local)

| Composant | Détails |
|-----------|---------|
| Image Docker | `ollama/ollama:latest` |
| Port | 11434 |
| Modèle par défaut | `mistral` (7B) |
| Alternatives | `llama3.1`, `phi3`, `gemma2` |
| Téléchargement modèle | `docker exec ollama ollama pull mistral` |
| RAM nécessaire | ~4-6 GB pour Mistral 7B |

**Premier lancement :** après `docker compose up ollama`, télécharger le modèle :
```bash
docker exec -it ollama ollama pull mistral
```

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
- **Modèle LLM plus grand** : passer à Llama 3.1 70B (avec GPU) pour de meilleures classifications
- **Index HNSW** : activer l'index pgvector pour les utilisateurs avec > 10k transactions
- **Embeddings incrémentaux** : ne recalculer que les embeddings des nouvelles transactions (déjà implémenté)
- **Cache LLM** : mettre en cache les réponses LLM par label représentatif pour éviter de re-classifier les mêmes clusters
