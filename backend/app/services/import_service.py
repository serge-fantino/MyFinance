"""File import service for transactions."""

import hashlib
from datetime import date
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

        for i, pt in enumerate(parsed_txns, start=1):
            try:
                label = pt.label or "(sans libellé)"

                # Build dedup hash — prefer OFX FITID when available
                if pt.fitid:
                    dedup_hash = hashlib.sha256(
                        f"fitid:{pt.fitid}|{account_id}".encode()
                    ).hexdigest()
                else:
                    dedup_hash = self._compute_hash(pt.date, pt.amount, label)

                # Check for duplicate
                existing = await self.db.execute(
                    select(Transaction).where(
                        Transaction.dedup_hash == dedup_hash,
                        Transaction.deleted_at.is_(None),
                    )
                )
                if existing.scalar_one_or_none():
                    duplicates += 1
                    continue

                # Build label_raw — append memo if different
                label_raw = label
                if pt.memo and pt.memo != label:
                    label_raw = f"{label} — {pt.memo}"

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
    def _compute_hash(txn_date: date, amount: Decimal, label: str) -> str:
        raw = f"{txn_date.isoformat()}|{amount}|{label.strip().lower()}"
        return hashlib.sha256(raw.encode()).hexdigest()
