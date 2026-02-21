"""Financial context builder for AI chat.

Analyzes user questions to detect intent, fetches relevant financial data,
and formats it as context for the LLM prompt.
"""

import re
from datetime import date, timedelta
from decimal import Decimal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.services.account_service import AccountService
from app.services.analytics_service import AnalyticsService
from app.services.transaction_service import TransactionService

logger = structlog.get_logger()

# Intent keywords (French)
_CASHFLOW_KEYWORDS = [
    "cashflow", "flux", "trésorerie", "entrées", "sorties",
    "revenus", "dépenses", "recettes", "charges",
]
_CATEGORY_KEYWORDS = [
    "catégorie", "categorie", "répartition", "repartition", "poste",
    "ventilation", "où va", "ou va", "budget", "alimentation",
    "transport", "logement", "loisir", "santé", "énergie",
]
_BALANCE_KEYWORDS = [
    "solde", "balance", "combien", "avoir", "patrimoine", "épargne",
    "compte", "fortune", "capital",
]
_TREND_KEYWORDS = [
    "tendance", "évolution", "evolution", "comparaison", "mois",
    "progression", "augmenté", "diminué", "hausse", "baisse",
]
_TRANSACTION_KEYWORDS = [
    "transaction", "opération", "achat", "virement", "prélèvement",
    "paiement", "dépense", "grosse", "plus cher", "dernière", "dernier",
]
_TOP_KEYWORDS = [
    "top", "plus gros", "plus grosse", "principal", "maximum", "max",
]


def detect_intents(question: str) -> list[str]:
    """Detect financial intents from a user question."""
    q = question.lower()
    intents = []

    if any(kw in q for kw in _CASHFLOW_KEYWORDS):
        intents.append("cashflow")
    if any(kw in q for kw in _CATEGORY_KEYWORDS):
        intents.append("categories")
    if any(kw in q for kw in _BALANCE_KEYWORDS):
        intents.append("balance")
    if any(kw in q for kw in _TREND_KEYWORDS):
        intents.append("trend")
    if any(kw in q for kw in _TRANSACTION_KEYWORDS):
        intents.append("transactions")
    if any(kw in q for kw in _TOP_KEYWORDS):
        intents.append("top")

    # Default: provide a general summary
    if not intents:
        intents.append("summary")

    return intents


def detect_period(question: str) -> tuple[date | None, date | None]:
    """Extract date range from question text."""
    q = question.lower()
    today = date.today()

    # "ce mois", "ce mois-ci"
    if "ce mois" in q:
        first_day = today.replace(day=1)
        return first_day, today

    # "mois dernier", "le mois dernier"
    if "mois dernier" in q or "mois précédent" in q:
        first_day = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
        last_day = today.replace(day=1) - timedelta(days=1)
        return first_day, last_day

    # "cette année"
    if "cette année" in q or "cette annee" in q:
        return date(today.year, 1, 1), today

    # "année dernière"
    if "année dernière" in q or "annee derniere" in q:
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)

    # "3 derniers mois", "6 derniers mois", etc.
    match = re.search(r"(\d+)\s*derniers?\s*mois", q)
    if match:
        months = int(match.group(1))
        start = today - timedelta(days=months * 30)
        return start, today

    # "janvier", "février", etc.
    month_names = {
        "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "decembre": 12,
    }
    for name, month_num in month_names.items():
        if name in q:
            year = today.year
            # If the month is in the future, assume last year
            if month_num > today.month:
                year -= 1
            first_day = date(year, month_num, 1)
            if month_num == 12:
                last_day = date(year, 12, 31)
            else:
                last_day = date(year, month_num + 1, 1) - timedelta(days=1)
            return first_day, last_day

    # Default: last 3 months for context
    return today - timedelta(days=90), today


def detect_direction(question: str) -> str | None:
    """Detect if the user is asking about income or expenses."""
    q = question.lower()
    income_kw = ["revenu", "entrée", "entree", "salaire", "crédit", "credit", "gagné"]
    expense_kw = ["dépense", "depense", "sortie", "débit", "debit", "payé", "acheté", "coût"]

    has_income = any(kw in q for kw in income_kw)
    has_expense = any(kw in q for kw in expense_kw)

    if has_income and not has_expense:
        return "income"
    if has_expense and not has_income:
        return "expense"
    return None


class FinancialContextBuilder:
    """Builds financial context for the AI chat based on detected intents."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_svc = AccountService(db)
        self.transaction_svc = TransactionService(db)
        self.analytics_svc = AnalyticsService(db)

    async def build_context(
        self,
        user: User,
        question: str,
    ) -> tuple[str, dict]:
        """Analyze question and return (context_text, chart_data).

        chart_data is a dict that can be sent to the frontend for rendering.
        """
        intents = detect_intents(question)
        date_from, date_to = detect_period(question)
        direction = detect_direction(question)

        context_parts = []
        chart_suggestions = {}

        logger.info(
            "financial_context",
            intents=intents,
            date_from=date_from,
            date_to=date_to,
            direction=direction,
        )

        # Always include account summary
        try:
            summary = await self.account_svc.get_summary(user)
            context_parts.append(self._format_accounts(summary))
        except Exception as e:
            logger.warning("context_accounts_failed", error=str(e))

        if "cashflow" in intents or "trend" in intents or "summary" in intents:
            try:
                cashflow = await self.transaction_svc.get_cashflow(
                    user,
                    granularity="monthly",
                    date_from=date_from,
                    date_to=date_to,
                )
                context_parts.append(self._format_cashflow(cashflow))
                if cashflow:
                    chart_suggestions["cashflow"] = {
                        "type": "bar",
                        "title": "Cashflow mensuel",
                        "data": cashflow,
                    }
            except Exception as e:
                logger.warning("context_cashflow_failed", error=str(e))

        if "categories" in intents or "summary" in intents:
            try:
                breakdown = await self.analytics_svc.by_category(
                    user,
                    date_from=date_from,
                    date_to=date_to,
                    direction=direction or "expense",
                )
                context_parts.append(self._format_categories(breakdown))
                if breakdown:
                    chart_suggestions["categories"] = {
                        "type": "pie",
                        "title": "Répartition par catégorie"
                            + (f" ({direction})" if direction else " (dépenses)"),
                        "data": [
                            {
                                "name": c["category_name"],
                                "value": abs(c["total"]),
                                "percentage": c["percentage"],
                            }
                            for c in breakdown[:10]
                        ],
                    }
            except Exception as e:
                logger.warning("context_categories_failed", error=str(e))

        if "balance" in intents:
            try:
                balance = await self.transaction_svc.get_balance_at_date(
                    user, date.today()
                )
                context_parts.append(f"\nSolde total actuel : {float(balance):.2f} €")
                chart_suggestions["balance"] = {
                    "type": "kpi",
                    "title": "Solde actuel",
                    "data": [{"label": "Solde total", "value": float(balance)}],
                }
            except Exception as e:
                logger.warning("context_balance_failed", error=str(e))

        if "transactions" in intents or "top" in intents:
            try:
                result = await self.transaction_svc.list_transactions(
                    user,
                    page=1,
                    per_page=min(20, settings.ai_chat_max_context_transactions),
                    date_from=date_from,
                    date_to=date_to,
                    sort_by="amount" if "top" in intents else "date",
                    sort_order="asc" if "top" in intents else "desc",
                )
                context_parts.append(self._format_transactions(result["data"]))
            except Exception as e:
                logger.warning("context_transactions_failed", error=str(e))

        # Add period info
        period_text = ""
        if date_from and date_to:
            period_text = f"\nPériode analysée : du {date_from.isoformat()} au {date_to.isoformat()}"
        context_parts.insert(0, period_text)

        return "\n".join(context_parts), chart_suggestions

    def _format_accounts(self, summary) -> str:
        lines = [
            f"\n=== COMPTES ({summary.total_accounts} comptes) ===",
            f"Solde total : {float(summary.total_balance):.2f} €",
        ]
        for acc in summary.accounts:
            balance = acc.get("current_balance", acc.get("initial_balance", 0))
            lines.append(
                f"  - {acc['name']} ({acc['type']}) : {float(balance):.2f} {acc['currency']}"
            )
        return "\n".join(lines)

    def _format_cashflow(self, cashflow: list[dict]) -> str:
        if not cashflow:
            return "\n=== CASHFLOW ===\nAucune donnée de cashflow disponible."
        lines = ["\n=== CASHFLOW MENSUEL ==="]
        for row in cashflow:
            lines.append(
                f"  {row['month']} : revenus={row['income']:.0f}€, "
                f"dépenses={row['expenses']:.0f}€, net={row['net']:.0f}€"
            )
        # Totals
        total_income = sum(r["income"] for r in cashflow)
        total_expenses = sum(r["expenses"] for r in cashflow)
        lines.append(f"  TOTAL : revenus={total_income:.0f}€, dépenses={total_expenses:.0f}€, net={total_income - total_expenses:.0f}€")
        return "\n".join(lines)

    def _format_categories(self, breakdown: list[dict]) -> str:
        if not breakdown:
            return "\n=== CATÉGORIES ===\nAucune donnée de catégorie."
        lines = ["\n=== RÉPARTITION PAR CATÉGORIE ==="]
        for cat in breakdown[:15]:
            parent = f"{cat['parent_name']} > " if cat["parent_name"] else ""
            lines.append(
                f"  - {parent}{cat['category_name']} : {abs(cat['total']):.0f}€ "
                f"({cat['percentage']}%, {cat['count']} transactions)"
            )
        return "\n".join(lines)

    def _format_transactions(self, transactions: list[dict]) -> str:
        if not transactions:
            return "\n=== TRANSACTIONS ===\nAucune transaction trouvée."
        lines = [f"\n=== TRANSACTIONS RÉCENTES ({len(transactions)}) ==="]
        for txn in transactions:
            cat = txn.get("category_name") or "Non classé"
            label = txn.get("label_clean") or txn.get("label_raw", "")
            lines.append(
                f"  {txn['date']} | {label[:40]:40s} | {float(txn['amount']):>+10.2f}€ | {cat}"
            )
        return "\n".join(lines)
