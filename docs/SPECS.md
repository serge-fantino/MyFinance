# MyFinance — Spécifications Fonctionnelles

> Version 1.2 — Février 2026

---

## 1. Vision produit

MyFinance est une application web de gestion de finances personnelles destinée à des utilisateurs souhaitant centraliser la gestion de leurs comptes bancaires, analyser leurs dépenses et bénéficier d'une assistance par intelligence artificielle pour mieux comprendre et piloter leurs finances.

### 1.1 Objectifs clés

- Offrir une vue consolidée multi-comptes à chaque utilisateur
- Automatiser la classification des transactions grâce à l'IA
- Fournir des visualisations claires (cashflow, répartition, tendances)
- Permettre un dialogue en langage naturel avec ses données financières
- Rester simple d'utilisation tout en étant extensible

---

## 2. Utilisateurs et rôles

### 2.1 Rôles

| Rôle | Description |
|------|------------|
| **Utilisateur** | Personne physique gérant ses comptes. Accède uniquement à ses propres données. |
| **Administrateur** | Gère la plateforme : utilisateurs, configuration globale, monitoring. |

### 2.2 Cas d'usage principaux

```
Utilisateur
  ├── S'inscrire / Se connecter
  ├── Gérer son profil
  ├── Gérer ses comptes bancaires (CRUD)
  ├── Importer des transactions (CSV, Excel, OFX, QIF)
  ├── Consulter ses transactions (liste, filtres, recherche)
  ├── Classifier les transactions (manuellement ou via IA)
  ├── Gérer les règles de classification
  ├── Voir le tableau de bord consolidé
  ├── Analyser les dépenses par catégorie
  ├── Visualiser le cashflow
  ├── Consulter les prévisions (forecast)
  ├── Poser des questions à l'assistant IA
  └── Gérer les catégories de dépenses (paramètres)

Administrateur
  ├── Gérer les utilisateurs
  ├── Voir les statistiques de la plateforme
  └── Configurer les paramètres globaux
```

---

## 3. Modules fonctionnels

### 3.1 Authentification & Gestion des utilisateurs

**Inscription**
- Formulaire : email, mot de passe, nom
- Validation email (format)
- Mot de passe : minimum 8 caractères, 1 majuscule, 1 chiffre
- Protection anti-brute-force (rate limiting)

**Connexion**
- Email + mot de passe
- JWT (access token + refresh token)
- Session persistante via refresh token (cookie HttpOnly)

**Profil utilisateur**
- Modification nom, email, mot de passe
- Suppression de compte (soft delete avec période de grâce de 30 jours)
- Préférences : devise par défaut, langue (FR/EN), fuseau horaire

### 3.2 Gestion des comptes bancaires

**Compte bancaire** (entité)
- Nom du compte (ex: "Compte courant BNP")
- Type : courant, épargne, carte crédit, investissement
- Devise (EUR, USD, GBP, CHF...)
- Banque / établissement
- Numéro de compte (optionnel, chiffré en base)
- Solde initial
- Couleur (pour l'affichage)
- Statut : actif / archivé

**Opérations**
- Créer, modifier, archiver un compte
- Voir la liste de ses comptes avec solde actuel calculé
- Vue consolidée : solde total toutes devises converties
- **Calibration du solde** : l'utilisateur fournit un solde connu à une date donnée.
  Le système calcule rétroactivement le solde initial (`initial_balance = solde_connu - somme_transactions_jusqu'à_date`).
  Le graphique de cashflow journalier reflète alors le vrai solde du compte.
  Les champs `balance_reference_date` et `balance_reference_amount` sont stockés sur le compte.

### 3.3 Transactions

**Transaction** (entité)
- Date de l'opération
- Date de valeur (optionnelle)
- Libellé (tel que fourni par la banque)
- Libellé nettoyé (normalisé par le système)
- Montant (positif = crédit, négatif = débit)
- Devise
- Catégorie (assignée manuellement ou par IA)
- Sous-catégorie (optionnelle)
- Notes utilisateur (optionnel)
- Tags (optionnel, multi-valeur)
- Compte bancaire associé
- Hash de déduplication (pour éviter les doublons à l'import)
- Source : import_csv, import_excel, import_ofx, manual

**Opérations**
- Liste paginée avec filtres :
  - Par compte (ou tous les comptes)
  - Par période (date début / fin, par mois, par plage personnalisée)
  - Par catégorie (arborescence avec indentation)
  - Par direction (revenus / dépenses)
  - Par montant (min / max)
  - Par texte (recherche fulltext sur libellé, avec debounce)
- Création manuelle d'une transaction
- Modification (catégorie, notes, tags)
- Suppression (soft delete)

**Vue transactions enrichie**
- Colonnes du tableau redimensionnables par l'utilisateur (drag & resize)
- Tri dynamique par clic sur les en-têtes (date, montant, catégorie…)
- Libellé complet affiché (pas de troncature)
- Barre de filtres avancée intégrée en haut de page

**KPIs dynamiques**
- Nombre de transactions correspondant à la sélection/filtres actifs
- Total des revenus filtrés
- Total des dépenses filtrées
- Solde net filtré (coloré vert si positif, rouge si négatif)

**Graphique de cashflow intégré**
- Affiché directement sur la page des transactions, pliable/dépliable
- Deux granularités avec toggle :
  - **Mensuel** : barres revenus (vert) / dépenses (rouge) par mois
  - **Journalier** : courbe cumulative du solde dans le temps
- Vue journalière :
  - Courbe et aire colorées dynamiquement : vert quand le cumul est positif, rouge quand négatif
  - Le cumul démarre depuis le `initial_balance` du compte (ou la somme pour tous les comptes)
- Sélection interactive via brush (pinceau) pour filtrer les transactions affichées dans le tableau
- Clic sur une barre mensuelle pour filtrer par mois

### 3.4 Import de données

**Formats supportés (v1)**
- **CSV** : Séparateur configurable, mapping de colonnes par l'utilisateur
- **Excel (.xlsx)** : Même logique que CSV
- **OFX / QFX** (Open Financial Exchange) : Format bancaire standard, parsing automatique via `ofxparse`
- **XML bancaire** : Fichiers XML conformes au format OFX, détectés automatiquement
- **QIF** (Quicken Interchange Format) : Format legacy mais courant *(prévu)*

Les fichiers OFX/QFX/XML sont parsés sans configuration : les champs `date`, `amount`, `label` et `fitid` (identifiant unique de transaction) sont extraits automatiquement. Le `fitid` est utilisé en priorité pour la déduplication lorsqu'il est disponible.

**Processus d'import**
1. Upload du fichier (drag & drop ou sélection)
2. Détection automatique du format par extension (`.csv`, `.xlsx`, `.ofx`, `.qfx`, `.xml`)
3. Prévisualisation des premières lignes (CSV/Excel) ou import direct (OFX/XML)
4. Mapping des colonnes (si CSV/Excel) ou validation (si OFX/QIF)
5. Détection des doublons : 1) hash exact = date+montant+libellé+index (index = ordre parmi les transactions identiques dans le lot, en général 1) ; 2) fuzzy : montant+libellé dans ±7 jours. L'index évite les collisions (ex: 2 tickets métro identiques → #1 et #2).
6. Import avec rapport : X importées, Y doublons ignorés, Z erreurs
7. Lancement de la classification IA en arrière-plan

### 3.5 Catégorisation

#### 3.5.1 Catégories

**Deux niveaux de catégories :**
- **Catégories système** (`is_system=true`) : fournies par défaut, non supprimables, visibles par tous les utilisateurs
- **Catégories utilisateur** (`user_id=X`) : créées par l'utilisateur, modifiables et supprimables

**Catégories par défaut**
```
Revenus
  ├── Salaire
  ├── Freelance
  ├── Investissements
  └── Autres revenus

Dépenses
  ├── Logement (loyer, crédit, charges)
  ├── Alimentation (courses, restaurants)
  ├── Transport (carburant, transport en commun, parking)
  ├── Santé (médecin, pharmacie, mutuelle)
  ├── Loisirs (sorties, abonnements, sport)
  ├── Shopping (vêtements, électronique)
  ├── Éducation
  ├── Épargne & Investissement
  ├── Impôts & Taxes
  └── Divers

Transferts
  └── Virement entre comptes
```

**Gestion des catégories (Paramètres)**
- Page dédiée dans les paramètres pour voir, créer, modifier, supprimer les catégories
- Vue arborescente : les catégories système sont affichées en lecture seule, les catégories utilisateur sont éditables
- Création de sous-catégories rattachées à un parent
- Chaque catégorie a un nom, une icône optionnelle et une couleur optionnelle

#### 3.5.2 Règles de classification

Le système utilise un moteur de **règles explicites** pour classifier automatiquement les transactions. Les règles peuvent être créées manuellement par l'utilisateur ou générées par l'IA.

**Règle de classification** (entité)
- **Pattern** : le motif de correspondance (texte extrait du libellé bancaire)
- **Type de correspondance** (`match_type`) : `contains` (le libellé contient le pattern), `exact` (correspondance exacte), `starts_with`
- **Catégorie cible** (`category_id`) : la catégorie à assigner automatiquement
- **Libellé personnalisé** (`custom_label`) : un libellé clair défini par l'utilisateur (ex: "Salaire Serge", "Loyer appartement", "Abonnement Netflix"). Ce libellé est stocké dans `label_clean` de la transaction et sert de contexte supplémentaire pour l'IA.
- **Priorité** : ordre d'évaluation (les règles de priorité haute sont évaluées en premier)
- **Statut** : active / inactive
- **Origine** : `manual` (créée par l'utilisateur) ou `ai` (suggérée par l'IA)
- **Propriétaire** : chaque règle appartient à un utilisateur

**Moteur de classification — Ordre d'exécution :**
1. **Parsing des libellés** : extraction automatique des métadonnées structurées (mode de paiement, tiers, carte, date) depuis le libellé brut via pattern matching.
2. **Règles utilisateur** : pour chaque transaction non classée, le moteur cherche la première règle active dont le pattern correspond au libellé (`label_raw`). Si trouvée : assigne la catégorie + le libellé personnalisé.
3. **Calcul d'embeddings** : les transactions non classées sont vectorisées localement via sentence-transformers (CPU). Le texte embedé utilise le nom du tiers nettoyé (counterparty) plutôt que le libellé brut complet.
4. **Suggestions par embeddings** : clustering HDBSCAN + suggestion par voisinage k-NN ou sémantique des catégories. L'utilisateur valide chaque suggestion.

**Création automatique de règles :**
- Quand un utilisateur assigne manuellement une catégorie à une transaction, le système **crée automatiquement une règle** de type `contains` basée sur le libellé de la transaction.
- L'utilisateur peut fournir un **libellé personnalisé** au même moment.
- Après création de la règle, le système **applique immédiatement** cette règle à toutes les transactions non classées ayant un libellé similaire, et la liste est rafraîchie.

**Gestion des règles**
- Page/section dédiée dans les paramètres pour lister, modifier, supprimer les règles
- Chaque règle affiche : pattern, catégorie, libellé personnalisé, nombre de transactions matchées
- Possibilité de tester une règle avant de l'enregistrer

#### 3.5.3 Classification par embeddings (local)

> Voir [EMBEDDING_CLASSIFICATION.md](EMBEDDING_CLASSIFICATION.md) pour la stratégie détaillée.

La classification IA a été remplacée par un système local basé sur des embeddings sémantiques :

- **Preprocessing** : les libellés bancaires sont parsés pour extraire des métadonnées structurées (mode de paiement, tiers, carte, date) via regex. Les métadonnées sont stockées dans une colonne `parsed_metadata` (JSONB).
- **Modèle** : `paraphrase-multilingual-MiniLM-L12-v2` (sentence-transformers, CPU, 384 dimensions)
- **Stockage** : colonne `vector(384)` via pgvector dans PostgreSQL
- **Input amélioré** : l'embedding est calculé sur le nom du tiers nettoyé (`counterparty`) plutôt que sur le libellé brut complet, ce qui améliore significativement la qualité du clustering (regroupement par marchand plutôt que par type de paiement).
- **Pipeline** : à l'import : parsing libellé → application règles → calcul embeddings

**Suggestion par voisinage (k-NN) :**
- Pour chaque transaction non classée, recherche des K=5 transactions classées les plus proches par similarité cosinus
- Si la similarité dépasse le seuil → suggestion de la catégorie la plus fréquente parmi les voisins

**Suggestion par LLM local (Ollama + Mistral) :**
- Si aucun voisin classé n'est assez proche → le LLM local classifie le cluster
- Le LLM reçoit les catégories enrichies (avec descriptions, mots-clés, exemples de marchands) et les transactions du cluster
- Retourne une catégorie, un niveau de confiance, et une explication en langage naturel
- Le LLM a la connaissance du monde nécessaire (ex: "LECLERC" = supermarché = Alimentation)

**Clustering :**
- Les transactions non classées sont regroupées en clusters par similarité cosinus
- Chaque cluster reçoit une suggestion de catégorie (par k-NN ou par LLM)
- L'utilisateur décide d'accepter, modifier ou ignorer chaque suggestion

**Principes :**
- L'utilisateur garde **toujours le contrôle** : aucune classification automatique par embeddings
- Le système **propose**, l'utilisateur **dispose**
- Confiance affichée : badge coloré (vert = high, orange = medium, rouge = low)
- L'utilisateur peut corriger → cela crée/met à jour une règle (feedback loop durable)
- Les corrections enrichissent automatiquement les suggestions futures (via similarité)

**Intégration OpenAI** : désactivée au profit du système local (embeddings + LLM Ollama). Tout tourne en local sans dépendance externe.

### 3.6 Tableau de bord

**Widgets**
1. **Solde global** : Somme de tous les comptes actifs
2. **Solde par compte** : Barre/liste avec le solde de chaque compte
3. **Cashflow mensuel** : Graphique barres (revenus vs dépenses par mois)
4. **Répartition des dépenses** : Camembert / donut par catégorie
5. **Évolution du solde** : Courbe sur 6/12 mois
6. **Dernières transactions** : Liste des 10 dernières
7. **Top dépenses du mois** : Les 5 catégories les plus dépensières
8. **Forecast** : Projection à 3 mois basée sur les tendances

**Filtres globaux**
- Période (mois courant, 3 mois, 6 mois, 12 mois, personnalisé)
- Compte(s) sélectionné(s)

### 3.7 Analyses & Rapports

**Cashflow**
- Vue mensuelle / trimestrielle / annuelle
- Revenus totaux vs Dépenses totales
- Solde net (épargne)
- Graphique en cascade (waterfall)

**Analyse par catégorie**
- Répartition en pourcentage
- Évolution mois par mois
- Comparaison avec la moyenne des N derniers mois
- Drill-down : cliquer sur une catégorie → voir les transactions

**Forecast**
- Basé sur la moyenne mobile pondérée des 3 derniers mois
- Prise en compte des transactions récurrentes détectées
- Affichage en graphique avec intervalle de confiance

### 3.8 Assistant IA (Chat)

**Fonctionnalités**
- Interface de chat intégrée
- Contexte : l'IA a accès aux données financières de l'utilisateur
- Questions possibles :
  - "Combien j'ai dépensé en restaurants ce mois-ci ?"
  - "Quelle est ma tendance de dépenses sur les 6 derniers mois ?"
  - "Quels sont mes abonnements récurrents ?"
  - "Comment optimiser mes dépenses ?"
  - "Compare mes dépenses de janvier et février"
- Réponses avec données chiffrées et graphiques inline
- Historique des conversations

**Sécurité**
- L'IA n'a accès qu'aux données de l'utilisateur connecté
- Aucune donnée financière n'est stockée côté OpenAI (API stateless)
- Les prompts système sont non-modifiables par l'utilisateur

---

## 4. Exigences non-fonctionnelles

### 4.1 Performance
- Temps de réponse API < 200ms (hors IA)
- Temps de réponse IA < 5s
- Import de 10 000 transactions < 30s
- Dashboard chargé en < 1s

### 4.2 Sécurité
- HTTPS obligatoire
- Mots de passe hashés (bcrypt, cost 12)
- JWT avec expiration courte (30 min) + refresh token
- Chiffrement des données sensibles en base (numéros de compte)
- Rate limiting sur les endpoints d'authentification
- CORS configuré strictement
- Validation et sanitisation de tous les inputs
- Protection CSRF

### 4.3 Scalabilité
- Architecture stateless (backend) → scaling horizontal
- Base de données : partitionnement par utilisateur si nécessaire
- Files d'attente pour les traitements longs (import, classification IA)

### 4.4 Disponibilité
- Cible : 99.5% uptime
- Healthcheck sur tous les services
- Backups automatiques de la base de données (quotidien)

### 4.5 Internationalisation
- Interface en français (v1), extensible à l'anglais
- Support multi-devises avec taux de change

---

## 5. Contraintes techniques

- Application responsive (mobile-first pour la consultation)
- Support navigateurs : Chrome, Firefox, Safari, Edge (2 dernières versions)
- API RESTful avec documentation OpenAPI/Swagger auto-générée
- Tests unitaires et d'intégration (couverture cible : 80%)
- CI/CD automatisé

---

## 6. Hors périmètre (v1)

- Connexion directe aux banques (Open Banking / DSP2)
- Application mobile native
- Multi-devises avec conversion en temps réel
- Partage de comptes entre utilisateurs
- Export PDF des rapports
- Notifications (email, push)

Ces fonctionnalités sont prévues pour des versions ultérieures.
