"""File import service for transactions."""

import hashlib
import re
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.account import Account
from app.models.transaction import ImportLog, Transaction
from app.models.user import User
from app.services.label_parser import parse_label
from app.utils.file_parsers import (
    ParsedTransaction,
    parse_csv,
    parse_excel,
    parse_ofx,
)

# Supported extensions → (parser_function, format_label)
_PARSERS: dict[str, tuple] = {
    "csv": (parse_csv, "csv"),
    "xlsx": (parse_excel, "excel"),
    "xls": (parse_excel, "excel"),
    "ofx": (parse_ofx, "ofx"),
    "qfx": (parse_ofx, "ofx"),       # QFX is Quicken's variant of OFX
    "xml": (parse_ofx, "ofx"),        # Some banks export OFX as .xml
}

SUPPORTED_EXTENSIONS = sorted(_PARSERS.keys())

# Fenêtre de dates pour la détection de doublons entre fichiers différents
# (même transaction avec date légèrement différente selon l'export)
DEDUP_DATE_WINDOW_DAYS = 7


class ImportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def import_file(
        self,
        user: User,
        account_id: int,
        filename: str,
        content: bytes,
    ) -> dict:
        """Import transactions from a file (CSV, Excel, OFX/QFX)."""
        # Verify account ownership
        result = await self.db.execute(select(Account).where(Account.id == account_id))
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundError("Account")
        if account.user_id != user.id:
            raise NotFoundError("Account")

        # Detect format from extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in _PARSERS:
            supported = ", ".join(f".{e}" for e in SUPPORTED_EXTENSIONS)
            raise ValidationError(
                f"Format non supporté : .{ext}. Formats acceptés : {supported}"
            )

        parser_fn, fmt = _PARSERS[ext]

        # Parse the file
        try:
            parsed_txns: list[ParsedTransaction] = parser_fn(content)
        except Exception as e:
            raise ValidationError(f"Erreur de parsing du fichier : {e}") from e

        if not parsed_txns:
            raise ValidationError("Le fichier ne contient aucune transaction.")

        # Process parsed transactions
        imported = 0
        duplicates = 0
        errors: list[str] = []
        # Compteur d'occurrences par (date, montant, libellé) dans ce lot d'import
        # → index = ordre parmi les transactions identiques (#1, #2, #3...)
        hash_base_counts: dict[tuple[date, Decimal, str], int] = {}

        for i, pt in enumerate(parsed_txns, start=1):
            try:
                label = pt.label or "(sans libellé)"
                label_norm = label.strip().lower()
                key = (pt.date, pt.amount, label_norm)

                # Index = ordre parmi les transactions avec le même (date, montant, libellé)
                # En général 1 ; 2, 3... seulement s'il y a des doublons dans le fichier
                hash_base_counts[key] = hash_base_counts.get(key, 0) + 1
                index = hash_base_counts[key]

                dedup_hash = self._compute_hash(pt.date, pt.amount, label, index=index)

                # Check for duplicate: 1) exact hash, 2) fuzzy (amount+label in date window)
                existing = await self.db.execute(
                    select(Transaction).where(
                        Transaction.dedup_hash == dedup_hash,
                        Transaction.deleted_at.is_(None),
                    )
                )
                if existing.scalar_one_or_none():
                    duplicates += 1
                    continue

                # Fuzzy dedup: même transaction dans un autre fichier (date légèrement différente)
                label_raw = label
                if pt.memo and pt.memo != label:
                    label_raw = f"{label} — {pt.memo}"
                if await self._is_duplicate_fuzzy(account_id, pt.date, pt.amount, label_raw):
                    duplicates += 1
                    continue

                # Parse structured metadata from the raw label
                parsed_metadata = parse_label(label_raw)

                txn = Transaction(
                    account_id=account_id,
                    date=pt.date,
                    label_raw=label_raw,
                    parsed_metadata=parsed_metadata,
                    amount=pt.amount,
                    currency=account.currency,
                    dedup_hash=dedup_hash,
                    source=f"import_{fmt}",
                )
                self.db.add(txn)
                imported += 1

            except Exception as e:
                errors.append(f"Transaction {i}: {e}")

        await self.db.flush()

        # Log the import
        log = ImportLog(
            user_id=user.id,
            account_id=account_id,
            filename=filename,
            format=fmt,
            status="done",
            total_rows=len(parsed_txns),
            imported_count=imported,
            duplicate_count=duplicates,
            error_count=len(errors),
            errors_detail={"errors": errors[:50]} if errors else None,
        )
        self.db.add(log)
        await self.db.flush()

        return {
            "total_rows": len(parsed_txns),
            "imported_count": imported,
            "duplicate_count": duplicates,
            "error_count": len(errors),
            "errors": errors[:20] if errors else None,
        }

    @staticmethod
    def _compute_hash(txn_date: date, amount: Decimal, label: str, index: int = 1) -> str:
        """Hash pour déduplication : date + montant + libellé + index.

        L'index = ordre parmi les transactions avec le même (date, montant, libellé)
        dans le lot d'import. En général 1 ; 2, 3... si doublons (ex: 2 tickets métro).
        """
        raw = f"{txn_date.isoformat()}|{amount}|{label.strip().lower()}|{index}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def _normalize_label_for_dedup(label: str) -> str:
        """Normalise le libellé pour comparaison (espaces, casse, espaces multiples)."""
        if not label:
            return ""
        s = label.strip().lower()
        s = re.sub(r"\s+", " ", s)
        return s

    async def _is_duplicate_fuzzy(
        self, account_id: int, txn_date: date, amount: Decimal, label_raw: str
    ) -> bool:
        """Détecte un doublon via montant + libellé dans une fenêtre de dates.

        Utile quand la même transaction est importée depuis des fichiers différents
        avec une date légèrement différente (export à des jours différents).
        """
        normalized = self._normalize_label_for_dedup(label_raw)
        if not normalized:
            return False

        date_min = txn_date - timedelta(days=DEDUP_DATE_WINDOW_DAYS)
        date_max = txn_date + timedelta(days=DEDUP_DATE_WINDOW_DAYS)

        result = await self.db.execute(
            select(Transaction).where(
                Transaction.account_id == account_id,
                Transaction.amount == amount,
                Transaction.date >= date_min,
                Transaction.date <= date_max,
                Transaction.deleted_at.is_(None),
            )
        )
        candidates = result.scalars().all()

        for txn in candidates:
            if self._normalize_label_for_dedup(txn.label_raw) == normalized:
                return True
        return False
