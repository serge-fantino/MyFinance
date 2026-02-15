"""Enriched category descriptions for LLM classification.

Provides rich textual descriptions for each default category, including
typical keywords, merchant examples, and transaction patterns. These
descriptions help the LLM correctly classify transactions into categories.

The descriptions are keyed by category name (case-insensitive matching).
User-created categories can also have descriptions added here or will
use their name as-is.
"""

# Map: category_name (lowercase) → rich description
CATEGORY_DESCRIPTIONS: dict[str, str] = {
    # ── Revenus ────────────────────────────────────────
    "salaire": (
        "Salaire, paie, rémunération mensuelle. "
        "Virements réguliers de l'employeur."
    ),
    "freelance": (
        "Revenus freelance, missions, honoraires, prestations de service. "
        "Paiements de clients pour du travail indépendant."
    ),
    "investissements": (
        "Dividendes, intérêts, plus-values, revenus de placement. "
        "Coupons, rendements d'assurance-vie, PEA, compte-titres."
    ),
    "autres revenus": (
        "Remboursements, allocations, aides (CAF, APL), cadeaux reçus, "
        "ventes d'occasion, cashback, primes diverses."
    ),
    # ── Dépenses ───────────────────────────────────────
    "logement": (
        "Loyer, charges, copropriété, EDF, Engie, eau, électricité, gaz, "
        "assurance habitation, taxe d'habitation, travaux, bricolage, "
        "Leroy Merlin, Castorama, IKEA, Conforama."
    ),
    "alimentation": (
        "Courses alimentaires, supermarché, épicerie, boulangerie, "
        "marché, restaurants, fast-food, livraison repas. "
        "Leclerc, Carrefour, Auchan, Lidl, Intermarché, Monoprix, "
        "Picard, Franprix, Casino, U Express, McDo, KFC, Uber Eats, "
        "Deliveroo, Just Eat, boucherie, poissonnerie."
    ),
    "transport": (
        "Essence, carburant, péage, parking, stationnement, "
        "transports en commun, métro, bus, tramway, train, SNCF, RATP, "
        "Navigo, taxi, Uber, Bolt, VTC, location voiture, Sixt, Hertz, "
        "entretien auto, contrôle technique, assurance auto, "
        "Total, Shell, BP, Esso, autoroute, Vinci, SANEF, Indigo."
    ),
    "sante": (
        "Médecin, pharmacie, dentiste, ophtalmo, kiné, ostéo, "
        "hôpital, clinique, laboratoire d'analyses, mutuelle, "
        "CPAM, Sécurité sociale, remboursement santé, optique, lunettes, "
        "Doctolib, parapharmacie."
    ),
    "loisirs": (
        "Cinéma, théâtre, concert, musée, sport, salle de sport, "
        "Netflix, Spotify, Disney+, Amazon Prime, abonnements streaming, "
        "jeux vidéo, PlayStation, Steam, sorties, bars, clubs, "
        "vacances, hôtel, Airbnb, Booking, voyage, billet d'avion."
    ),
    "shopping": (
        "Vêtements, chaussures, accessoires, high-tech, électronique, "
        "Amazon, Fnac, Darty, Zara, H&M, Decathlon, Nike, Apple, "
        "Boulanger, Cdiscount, cadeaux, bijouterie, cosmétiques, "
        "Sephora, parfumerie, librairie."
    ),
    "education": (
        "Scolarité, université, formation, cours particuliers, "
        "livres scolaires, fournitures, garderie, crèche, "
        "cantine scolaire, études, MOOC, apprentissage."
    ),
    "epargne & investissement": (
        "Virement vers livret A, LDD, PEL, assurance-vie, PEA, "
        "compte-titres, investissement immobilier, SCPI, crypto, "
        "épargne programmée, placement financier."
    ),
    "impots & taxes": (
        "Impôt sur le revenu, taxe foncière, taxe d'habitation, "
        "CSG, CRDS, prélèvement à la source, amendes, "
        "Direction Générale des Finances Publiques, DGFIP, Trésor Public."
    ),
    "divers": (
        "Dépenses inclassables, frais bancaires, cotisation carte, "
        "agios, frais de tenue de compte, commissions, "
        "assurance diverse, don, association, cotisation."
    ),
    # ── Transferts ─────────────────────────────────────
    "virement entre comptes": (
        "Virement interne entre mes propres comptes bancaires. "
        "Transfert d'un compte courant vers un autre, "
        "mouvement entre comptes de la même personne."
    ),
}


def get_category_description(category_name: str) -> str:
    """Get the enriched description for a category.

    Returns the rich description if available, empty string otherwise.
    """
    return CATEGORY_DESCRIPTIONS.get(category_name.lower(), "")


def enrich_categories(categories: list[dict]) -> list[dict]:
    """Add descriptions to a list of category dicts.

    Each category dict should have at least 'id' and 'name'.
    Adds a 'description' key with the enriched text.
    """
    for cat in categories:
        cat["description"] = get_category_description(cat.get("name", ""))
    return categories
