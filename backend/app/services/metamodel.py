"""Financial data metamodel for the AI chat query engine.

Defines the sources (tables), fields, relationships, temporal functions,
and aggregators that the LLM is allowed to use in dataviz queries.
The metamodel is both:
  - a runtime schema used by the query engine to validate and compile queries
  - a JSON-serialisable description injected into the LLM system prompt
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ---------------------------------------------------------------------------
# Field / type enums
# ---------------------------------------------------------------------------

class FieldType(str, Enum):
    """Data types exposed to the LLM."""
    QUANTITATIVE = "quantitative"  # numbers (amount, count, balance …)
    NOMINAL = "nominal"            # unordered categories (name, type …)
    TEMPORAL = "temporal"          # dates
    ORDINAL = "ordinal"            # ordered categories (month index …)


class AggregateFunction(str, Enum):
    SUM = "sum"
    COUNT = "count"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    COUNT_DISTINCT = "count_distinct"


class TemporalFunction(str, Enum):
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"
    WEEK = "week"
    DAY = "day"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FieldDef:
    """A single field in a source."""
    name: str
    type: FieldType
    description: str = ""
    filterable: bool = True
    aggregatable: bool = False  # True for quantitative fields that can be aggregated

    def to_prompt_dict(self) -> dict:
        d: dict = {"name": self.name, "type": self.type.value}
        if self.description:
            d["description"] = self.description
        d["filterable"] = self.filterable
        if self.aggregatable:
            d["aggregatable"] = True
        return d


@dataclass(frozen=True)
class RelationDef:
    """Implicit join between two sources."""
    target: str          # target source name
    description: str = ""

    def to_prompt_dict(self) -> dict:
        return {"target": self.target, "description": self.description}


@dataclass(frozen=True)
class SourceDef:
    """A queryable data source (maps to a DB table or virtual view)."""
    name: str
    description: str = ""
    fields: list[FieldDef] = field(default_factory=list)
    relations: list[RelationDef] = field(default_factory=list)
    virtual: bool = False  # True for computed sources (balance)

    # ---- helpers ----
    def field_names(self) -> set[str]:
        return {f.name for f in self.fields}

    def get_field(self, name: str) -> FieldDef | None:
        for f in self.fields:
            if f.name == name:
                return f
        return None

    def relation_targets(self) -> set[str]:
        return {r.target for r in self.relations}

    def to_prompt_dict(self) -> dict:
        d: dict = {
            "name": self.name,
            "description": self.description,
            "fields": [f.to_prompt_dict() for f in self.fields],
        }
        if self.relations:
            d["relations"] = [r.to_prompt_dict() for r in self.relations]
        return d


# ===================================================================
# METAMODEL DEFINITION — the single source of truth
# ===================================================================

TRANSACTIONS_SOURCE = SourceDef(
    name="transactions",
    description="Opérations bancaires (dépenses, revenus, virements)",
    fields=[
        FieldDef("date", FieldType.TEMPORAL, "Date de l'opération"),
        FieldDef("amount", FieldType.QUANTITATIVE, "Montant (positif=revenu, négatif=dépense)", aggregatable=True),
        FieldDef("label", FieldType.NOMINAL, "Libellé de l'opération (label_clean ou label_raw)"),
        FieldDef("direction", FieldType.NOMINAL, "\"income\" ou \"expense\" (dérivé du signe de amount)", filterable=True),
        FieldDef("currency", FieldType.NOMINAL, "Devise (EUR par défaut)"),
    ],
    relations=[
        RelationDef("category", "Catégorie de la transaction"),
        RelationDef("account", "Compte bancaire"),
    ],
)

CATEGORY_SOURCE = SourceDef(
    name="category",
    description="Catégories de dépenses/revenus",
    fields=[
        FieldDef("name", FieldType.NOMINAL, "Nom de la catégorie"),
        FieldDef("parent_name", FieldType.NOMINAL, "Nom de la catégorie parente (si sous-catégorie)"),
    ],
)

ACCOUNT_SOURCE = SourceDef(
    name="account",
    description="Comptes bancaires de l'utilisateur",
    fields=[
        FieldDef("name", FieldType.NOMINAL, "Nom du compte"),
        FieldDef("bank_name", FieldType.NOMINAL, "Nom de la banque"),
        FieldDef("type", FieldType.NOMINAL, "Type de compte (courant, epargne, carte, invest)"),
    ],
)

BALANCE_SOURCE = SourceDef(
    name="balance",
    description="Solde calculé des comptes (source virtuelle)",
    fields=[
        FieldDef("date", FieldType.TEMPORAL, "Date du solde"),
        FieldDef("amount", FieldType.QUANTITATIVE, "Solde à cette date", aggregatable=True),
        FieldDef("account_name", FieldType.NOMINAL, "Nom du compte"),
    ],
    virtual=True,
)

# -- registry --
ALL_SOURCES: dict[str, SourceDef] = {
    s.name: s for s in [TRANSACTIONS_SOURCE, CATEGORY_SOURCE, ACCOUNT_SOURCE, BALANCE_SOURCE]
}

ALLOWED_AGGREGATES: set[str] = {a.value for a in AggregateFunction}
ALLOWED_TEMPORAL_FUNCTIONS: set[str] = {t.value for t in TemporalFunction}
ALLOWED_FILTER_OPS: set[str] = {"=", "!=", ">", "<", ">=", "<=", "in", "not_in", "like"}


# ---------------------------------------------------------------------------
# Prompt generation — what the LLM sees
# ---------------------------------------------------------------------------

def metamodel_prompt_json() -> dict:
    """Return a JSON-serialisable description of the metamodel for the LLM prompt."""
    return {
        "sources": [s.to_prompt_dict() for s in ALL_SOURCES.values()],
        "temporal_functions": list(ALLOWED_TEMPORAL_FUNCTIONS),
        "aggregate_functions": list(ALLOWED_AGGREGATES),
        "filter_operators": list(ALLOWED_FILTER_OPS),
    }


def metamodel_prompt_text() -> str:
    """Compact textual description injected in the LLM system prompt."""
    import json
    schema = metamodel_prompt_json()
    return json.dumps(schema, ensure_ascii=False, indent=2)
