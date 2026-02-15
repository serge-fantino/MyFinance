"""Label parser for French bank transaction labels.

Extracts structured metadata from raw bank labels using regex pattern matching.

French bank labels typically follow the format:
    <PAYMENT_MODE> — <DETAILS>

Where DETAILS may contain:
    - A date prefix: "DU DDMMYY" or "DU DD/MM/YY"
    - A counterparty/merchant name
    - A card identifier: "CARTE 4974XXXXXXXX3769"
    - A reference: "REF: ABC123"

Examples:
    "FACTURE CARTE — DU 140126 PARK TRIVAUX BS MEUDON CARTE 4974XXXXXXXX3769"
    → payment_mode="FACTURE CARTE", counterparty="PARK TRIVAUX BS MEUDON",
      card_id="4974XXXXXXXX3769", operation_date="2026-01-14"

    "VIREMENT SEPA — CPAM DES HAUTS DE SEINE"
    → payment_mode="VIREMENT SEPA", counterparty="CPAM DES HAUTS DE SEINE"

    "CB LECLERC 25/01"
    → payment_mode="CB", counterparty="LECLERC", operation_date extracted
"""

import re
from datetime import date as date_type

import structlog

logger = structlog.get_logger()

# ── Payment mode patterns (ordered by length desc for greedy matching) ──

PAYMENT_MODES: list[tuple[str, str]] = [
    # Carte (card payments)
    ("PAIEMENT PAR CARTE", "card"),
    ("PAIEMENT CARTE", "card"),
    ("FACTURE CARTE", "card"),
    ("CARTE BANCAIRE", "card"),
    # Virement (transfers)
    ("VIREMENT SEPA RECU", "transfer_in"),
    ("VIREMENT SEPA", "transfer"),
    ("VIR SEPA RECU", "transfer_in"),
    ("VIR INST RECU", "transfer_in"),
    ("VIR SEPA", "transfer"),
    ("VIR INST", "transfer"),
    ("VIREMENT RECU", "transfer_in"),
    ("VIR RECU", "transfer_in"),
    ("VIREMENT", "transfer"),
    ("VIR", "transfer"),
    # Prélèvement (direct debit)
    ("PRELEVEMENT SEPA", "direct_debit"),
    ("PRLV SEPA", "direct_debit"),
    ("PRELEVEMENT", "direct_debit"),
    ("PRLV", "direct_debit"),
    # Retrait (ATM withdrawal)
    ("RETRAIT DAB", "atm"),
    ("RETRAIT", "atm"),
    # Chèque (check)
    ("REMISE DE CHEQUE", "check_deposit"),
    ("REMISE DE CHQ", "check_deposit"),
    ("REMISE CHQ", "check_deposit"),
    ("CHEQUE", "check"),
    ("CHQ", "check"),
    # Fees and other
    ("COTISATION", "fee"),
    ("COMMISSION", "fee"),
    ("FRAIS", "fee"),
    ("ABONNEMENT", "subscription"),
    ("REMBOURSEMENT", "refund"),
    ("AVOIR", "credit"),
    # Short card prefix (must be after longer matches)
    ("CB", "card"),
]

# ── Regex patterns ──────────────────────────────────────────────

# Separator between mode and details: em dash (—), en dash (–), or spaced hyphen
_SEPARATOR_RE = re.compile(r"\s*[—–]\s*|\s+-\s+")

# Date prefix: "DU DDMMYY " (e.g., "DU 140126 ")
_DATE_PREFIX_DDMMYY = re.compile(r"^DU\s+(\d{2})(\d{2})(\d{2})\s+", re.IGNORECASE)

# Date prefix with slashes: "DU DD/MM/YY " or "DU DD/MM/YYYY "
_DATE_PREFIX_SLASH = re.compile(
    r"^DU\s+(\d{2})/(\d{2})/(\d{2,4})\s+", re.IGNORECASE
)

# Trailing inline date: " DD/MM" or " DD/MM/YY" at end of string
_DATE_TRAILING = re.compile(r"\s+(\d{2})/(\d{2})(?:/(\d{2,4}))?\s*$")

# Card identifier at end: "CARTE 4974XXXXXXXX3769" or "CARTE 4974****3769"
_CARD_SUFFIX_RE = re.compile(
    r"\s+CARTE\s+(\d{4}[\dX*]{4,}[\dX*]*\d{0,4})\s*$", re.IGNORECASE
)

# Card identifier inline (not at end)
_CARD_INLINE_RE = re.compile(
    r"\bCARTE\s+(\d{4}[\dX*]{4,}[\dX*]*\d{0,4})\b", re.IGNORECASE
)

# Reference / ID patterns at end
_REF_TRAILING_RE = re.compile(
    r"\s+(?:REF|ID|N[°O]?)\s*[:.]?\s*[\w/-]+\s*$", re.IGNORECASE
)

# Check number: "N° 1234567" or "NO 1234567"
_CHECK_NUM_RE = re.compile(r"N[°O]?\s*(\d+)", re.IGNORECASE)

# Multiple spaces → single space
_MULTI_SPACE_RE = re.compile(r"\s{2,}")


# ── Public API ──────────────────────────────────────────────────


def parse_label(label_raw: str) -> dict:
    """Parse a French bank transaction label into structured metadata.

    Returns a dict with:
    - payment_mode: str | None — detected payment type label
    - payment_type: str | None — normalized type code
    - counterparty: str | None — cleaned counterparty/merchant name
    - card_id: str | None — masked card number if found
    - operation_date: str | None — ISO date (YYYY-MM-DD) if found
    - check_number: str | None — check number if found
    - raw_details: str | None — the details part after separating mode
    """
    if not label_raw or not label_raw.strip():
        return _empty_result()

    label = _MULTI_SPACE_RE.sub(" ", label_raw.strip())

    # Step 1: Split on separator (em dash / en dash)
    parts = _SEPARATOR_RE.split(label, maxsplit=1)

    if len(parts) == 2:
        mode_part = parts[0].strip()
        details = parts[1].strip()
    else:
        # No separator — try to detect payment mode prefix
        mode_part, details = _extract_mode_prefix(label)

    # Step 2: Identify payment mode
    payment_mode, payment_type = _match_payment_mode(mode_part)

    # If mode matched but didn't consume the whole mode_part, push remainder to details
    if payment_mode and mode_part:
        remainder = mode_part[len(payment_mode) :].strip()
        if remainder:
            details = f"{remainder} {details}".strip() if details else remainder

    if not details:
        return {
            "payment_mode": payment_mode,
            "payment_type": payment_type,
            "counterparty": label if not payment_mode else None,
            "card_id": None,
            "operation_date": None,
            "check_number": None,
            "raw_details": None,
        }

    raw_details = details

    # Step 3: Extract card ID
    card_id = None
    card_match = _CARD_SUFFIX_RE.search(details)
    if card_match:
        card_id = card_match.group(1)
        details = details[: card_match.start()].strip()
    else:
        card_match = _CARD_INLINE_RE.search(details)
        if card_match:
            card_id = card_match.group(1)
            details = (
                details[: card_match.start()] + " " + details[card_match.end() :]
            ).strip()

    # Step 4: Extract date
    operation_date = None
    date_match = _DATE_PREFIX_DDMMYY.match(details)
    if date_match:
        operation_date = _parse_date_components(
            date_match.group(1), date_match.group(2), date_match.group(3)
        )
        details = details[date_match.end() :].strip()
    else:
        date_match = _DATE_PREFIX_SLASH.match(details)
        if date_match:
            operation_date = _parse_date_components(
                date_match.group(1), date_match.group(2), date_match.group(3)
            )
            details = details[date_match.end() :].strip()
        else:
            # Try trailing date (e.g., "LECLERC 25/01")
            date_match = _DATE_TRAILING.search(details)
            if date_match:
                yy = date_match.group(3)
                operation_date = _parse_date_components(
                    date_match.group(1), date_match.group(2), yy
                )
                details = details[: date_match.start()].strip()

    # Step 5: Extract check number (for check types)
    check_number = None
    if payment_type in ("check", "check_deposit"):
        chk_match = _CHECK_NUM_RE.search(details)
        if chk_match:
            check_number = chk_match.group(1)

    # Step 6: Strip trailing references
    details = _REF_TRAILING_RE.sub("", details).strip()

    # Step 7: Clean up remaining as counterparty
    counterparty = _MULTI_SPACE_RE.sub(" ", details).strip() or None

    return {
        "payment_mode": payment_mode,
        "payment_type": payment_type,
        "counterparty": counterparty,
        "card_id": card_id,
        "operation_date": operation_date,
        "check_number": check_number,
        "raw_details": raw_details,
    }


def get_embedding_text(parsed_metadata: dict | None, label_raw: str) -> str:
    """Return the cleaned text to use for embedding computation.

    Prefers the counterparty name (if parsed) over the full raw label,
    since the counterparty is the most semantically meaningful part.
    """
    if parsed_metadata and parsed_metadata.get("counterparty"):
        return parsed_metadata["counterparty"]
    return label_raw


def parse_labels_batch(labels: list[str]) -> list[dict]:
    """Parse a batch of labels. Convenience wrapper."""
    return [parse_label(lbl) for lbl in labels]


# ── Private helpers ─────────────────────────────────────────────


def _match_payment_mode(text: str | None) -> tuple[str | None, str | None]:
    """Match a payment mode from the text. Returns (mode_label, type_code)."""
    if not text:
        return None, None
    upper = text.upper().strip()
    for mode_str, type_code in PAYMENT_MODES:
        if upper == mode_str or upper.startswith(mode_str + " ") or upper.startswith(mode_str):
            return mode_str, type_code
    return None, None


def _extract_mode_prefix(label: str) -> tuple[str | None, str]:
    """Try to find a payment mode at the beginning of a label (no separator).

    Returns (mode_part_or_None, remaining_details).
    """
    upper = label.upper()
    for mode_str, _ in PAYMENT_MODES:
        if upper.startswith(mode_str + " "):
            return label[: len(mode_str)], label[len(mode_str) :].strip()
        if upper == mode_str:
            return label, ""
    return None, label


def _parse_date_components(dd: str, mm: str, yy: str | None) -> str | None:
    """Parse date components to ISO format (YYYY-MM-DD).

    Handles 2-digit years (assumes 2000s) and None year (uses current year).
    """
    try:
        day = int(dd)
        month = int(mm)
        if yy is None:
            year = date_type.today().year
        else:
            year = int(yy)
            if year < 100:
                year += 2000
        d = date_type(year, month, day)
        return d.isoformat()
    except (ValueError, TypeError):
        return None


def _empty_result() -> dict:
    return {
        "payment_mode": None,
        "payment_type": None,
        "counterparty": None,
        "card_id": None,
        "operation_date": None,
        "check_number": None,
        "raw_details": None,
    }
