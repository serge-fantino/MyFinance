"""File parsers for transaction import (CSV, Excel, OFX/XML).

Each parser returns a list[ParsedTransaction] — a uniform intermediate
representation consumed by ImportService.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from ofxparse import OfxParser


@dataclass
class ParsedTransaction:
    """Uniform transaction coming out of any parser."""

    date: date
    amount: Decimal
    label: str
    fitid: str | None = None       # OFX unique id (great for dedup)
    memo: str | None = None        # additional description
    txn_type: str | None = None    # OFX TRNTYPE (DEBIT, CREDIT, …)
    check_num: str | None = None
    raw: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# OFX / XML parser
# ---------------------------------------------------------------------------

def parse_ofx(content: bytes) -> list[ParsedTransaction]:
    """Parse an OFX/QFX file and return a list of ParsedTransaction.

    Supports OFX 1.x (SGML) and OFX 2.x (XML) via ofxparse.
    """
    ofx = OfxParser.parse(io.BytesIO(content))

    txns: list[ParsedTransaction] = []
    for account in _iter_accounts(ofx):
        stmt = account.statement
        if stmt is None:
            continue
        for t in stmt.transactions:
            txn_date = t.date.date() if isinstance(t.date, datetime) else t.date
            amount = Decimal(str(t.amount))

            # Prefer payee, fall back to name, then memo
            label = (t.payee or getattr(t, "name", None) or t.memo or "").strip()
            if not label:
                label = "(sans libellé)"

            memo = (t.memo or "").strip() if t.memo and t.memo.strip() != label else None

            txns.append(
                ParsedTransaction(
                    date=txn_date,
                    amount=amount,
                    label=label,
                    fitid=t.id if t.id else None,
                    memo=memo,
                    txn_type=t.type if hasattr(t, "type") else None,
                    check_num=getattr(t, "checknum", None),
                )
            )
    return txns


def _iter_accounts(ofx):
    """Yield all accounts present in the OFX object.

    ofxparse puts the main account at ofx.account and (for multi-account
    files) a list at ofx.accounts.
    """
    if hasattr(ofx, "accounts") and ofx.accounts:
        yield from ofx.accounts
    elif hasattr(ofx, "account") and ofx.account:
        yield ofx.account


# ---------------------------------------------------------------------------
# CSV parser
# ---------------------------------------------------------------------------

def parse_csv(content: bytes) -> list[ParsedTransaction]:
    """Parse CSV content. Auto-detects encoding and separator."""
    text = _decode(content)

    # Detect separator
    first_line = text.split("\n")[0]
    separator = ";"  # default for French bank exports
    if first_line.count(",") > first_line.count(";"):
        separator = ","
    if first_line.count("\t") > first_line.count(separator):
        separator = "\t"

    reader = csv.DictReader(io.StringIO(text), delimiter=separator)
    txns: list[ParsedTransaction] = []
    for row in reader:
        normalized = _normalize_csv_row(row)
        if normalized:
            txns.append(
                ParsedTransaction(
                    date=parse_date(normalized["date"]),
                    amount=parse_amount(normalized["amount"]),
                    label=normalized["label"],
                    raw=normalized,
                )
            )
    return txns


# ---------------------------------------------------------------------------
# Excel parser
# ---------------------------------------------------------------------------

def parse_excel(content: bytes) -> list[ParsedTransaction]:
    """Parse Excel (.xlsx) content."""
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise ValueError("Le fichier Excel est vide.")

    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter, None)
    if not header:
        wb.close()
        raise ValueError("Le fichier Excel n'a pas d'en-tête.")

    headers = [str(h).strip().lower() if h else f"col_{i}" for i, h in enumerate(header)]
    txns: list[ParsedTransaction] = []
    for raw_row in rows_iter:
        row_dict = dict(zip(headers, raw_row))
        normalized = _normalize_csv_row(row_dict)
        if normalized:
            txns.append(
                ParsedTransaction(
                    date=parse_date(normalized["date"]),
                    amount=parse_amount(normalized["amount"]),
                    label=normalized["label"],
                    raw=normalized,
                )
            )
    wb.close()
    return txns


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Impossible de décoder le fichier. Encodage non supporté.")


def _normalize_csv_row(row: dict) -> dict | None:
    """Map various column names to standard: date, amount, label."""
    row = {k.strip().lower(): v for k, v in row.items() if v is not None}

    date_val = (
        row.get("date")
        or row.get("date operation")
        or row.get("date_operation")
        or row.get("date d'operation")
        or row.get("date comptable")
        or ""
    )
    amount_val = (
        row.get("amount")
        or row.get("montant")
        or row.get("debit")
        or row.get("credit")
        or ""
    )
    # Handle separate debit/credit columns
    if not amount_val and ("debit" in row or "credit" in row):
        debit = row.get("debit", "") or ""
        credit = row.get("credit", "") or ""
        if str(debit).strip():
            amount_val = f"-{debit}" if not str(debit).startswith("-") else debit
        elif str(credit).strip():
            amount_val = credit

    label_val = (
        row.get("label")
        or row.get("libelle")
        or row.get("description")
        or row.get("libelle operation")
        or row.get("libelle_operation")
        or ""
    )

    if not str(date_val).strip() or not str(amount_val).strip():
        return None

    return {
        "date": str(date_val).strip(),
        "amount": str(amount_val).strip(),
        "label": str(label_val).strip(),
    }


def parse_date(value) -> date:
    """Parse date from various formats."""
    if not value:
        raise ValueError("Date manquante")

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    value = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%d/%m/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Format de date non reconnu: {value}")


def parse_amount(value) -> Decimal:
    """Parse amount, handling French number format (comma as decimal)."""
    if not value:
        raise ValueError("Montant manquant")

    if isinstance(value, (int, float)):
        return Decimal(str(value))

    cleaned = str(value).strip().replace(" ", "").replace("\u00a0", "")

    # French format: 1.234,56 → 1234.56
    if "," in cleaned and "." in cleaned:
        if cleaned.rindex(",") > cleaned.rindex("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")

    try:
        return Decimal(cleaned)
    except InvalidOperation as e:
        raise ValueError(f"Montant invalide: {value}") from e
