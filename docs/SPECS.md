# MyFinance — Spécifications Fonctionnelles

> Version 1.0 — Février 2026

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
  ├── Voir le tableau de bord consolidé
  ├── Analyser les dépenses par catégorie
  ├── Visualiser le cashflow
  ├── Consulter les prévisions (forecast)
  ├── Poser des questions à l'assistant IA
  └── Gérer les catégories de dépenses

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
  - Par compte
  - Par période (date début / fin)
  - Par catégorie
  - Par montant (min / max)
  - Par texte (recherche fulltext sur libellé)
- Création manuelle d'une transaction
- Modification (catégorie, notes, tags)
- Suppression (soft delete)

### 3.4 Import de données

**Formats supportés (v1)**
- **CSV** : Séparateur configurable, mapping de colonnes par l'utilisateur
- **Excel (.xlsx)** : Même logique que CSV
- **OFX** (Open Financial Exchange) : Format bancaire standard
- **QIF** (Quicken Interchange Format) : Format legacy mais courant

**Processus d'import**
1. Upload du fichier
2. Détection automatique du format
3. Prévisualisation des premières lignes
4. Mapping des colonnes (si CSV/Excel) ou validation (si OFX/QIF)
5. Détection des doublons (basée sur hash : date + montant + libellé)
6. Import avec rapport : X importées, Y doublons ignorés, Z erreurs
7. Lancement de la classification IA en arrière-plan

### 3.5 Catégorisation

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

**Classification IA**
- À l'import, chaque transaction non catégorisée est envoyée au modèle IA
- Le modèle utilise le libellé + le montant + l'historique de classification de l'utilisateur
- Confiance affichée (haute / moyenne / basse)
- L'utilisateur peut corriger → la correction enrichit le modèle (feedback loop)
- Catégories personnalisables par l'utilisateur

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
