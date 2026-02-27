"""File import service for transactions — two-phase: preview → confirm."""

import hashlib
import re
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.account import Account
from app.models.transaction import ImportLog, ImportRow, Transaction
from app.models.user import User
from app.services.file_service import FileService
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
DEDUP_DATE_WINDOW_DAYS = 7


class ImportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.file_service = FileService()

    # ── Phase 1: Preview ─────────────────────────────────────────────

    async def preview_import(
        self,
        user: User,
        filename: str,
        content: bytes,
        account_id: int | None = None,
    ) -> dict:
        """Parse file, create ImportLog + ImportRows, store file, return preview.

        account_id is optional at this stage (can be set later at confirm time).
        """
        # Detect format
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in _PARSERS:
            supported = ", ".join(f".{e}" for e in SUPPORTED_EXTENSIONS)
            raise ValidationError(
                f"Format non supporté : .{ext}. Formats acceptés : {supported}"
            )
        parser_fn, fmt = _PARSERS[ext]

        # Parse
        try:
            parsed_txns: list[ParsedTransaction] = parser_fn(content)
        except Exception as e:
            raise ValidationError(f"Erreur de parsing du fichier : {e}") from e

        if not parsed_txns:
            raise ValidationError("Le fichier ne contient aucune transaction.")

        # Compute file hash and check for re-import
        file_hash = self.file_service.compute_hash(content)
        file_already_imported = False
        existing_import = await self.db.execute(
            select(ImportLog).where(
                ImportLog.user_id == user.id,
                ImportLog.file_hash == file_hash,
                ImportLog.status.in_(["done", "confirmed"]),
            )
        )
        if existing_import.scalar_one_or_none():
            file_already_imported = True

        # Create ImportLog (pending)
        log = ImportLog(
            user_id=user.id,
            account_id=account_id,
            filename=filename,
            format=fmt,
            status="previewing",
            total_rows=len(parsed_txns),
            file_size=len(content),
            file_hash=file_hash,
        )
        self.db.add(log)
        await self.db.flush()

        # Store file
        rel_path = self.file_service.store_file(user.id, log.id, filename, content)
        log.file_path = rel_path

        # Build ImportRows with dedup analysis
        rows_data = []
        hash_base_counts: dict[tuple[date, Decimal, str], int] = {}
        imported_count = 0
        duplicate_count = 0
        error_count = 0

        for i, pt in enumerate(parsed_txns):
            row_raw = {
                "date": pt.date.isoformat() if pt.date else None,
                "amount": str(pt.amount) if pt.amount is not None else None,
                "label": pt.label or "",
                "memo": pt.memo or "",
            }

            try:
                label = pt.label or "(sans libellé)"
                label_norm = label.strip().lower()
                key = (pt.date, pt.amount, label_norm)

                hash_base_counts[key] = hash_base_counts.get(key, 0) + 1
                index = hash_base_counts[key]

                dedup_hash = self._compute_hash(pt.date, pt.amount, label, index=index)

                label_raw = label
                if pt.memo and pt.memo != label:
                    label_raw = f"{label} — {pt.memo}"

                # Check exact hash duplicate
                existing = await self.db.execute(
                    select(Transaction).where(
                        Transaction.dedup_hash == dedup_hash,
                        Transaction.deleted_at.is_(None),
                    )
                )
                existing_txn = existing.scalar_one_or_none()
                if existing_txn:
                    row = ImportRow(
                        import_log_id=log.id,
                        row_index=i,
                        status="duplicate_exact",
                        raw_data=row_raw,
                        duplicate_of_id=existing_txn.id,
                    )
                    self.db.add(row)
                    duplicate_count += 1
                    rows_data.append(self._row_to_dict(row, existing_txn))
                    continue

                # Check fuzzy duplicate (if account_id is known)
                if account_id:
                    fuzzy_match = await self._find_duplicate_fuzzy(account_id, pt.date, pt.amount, label_raw)
                    if fuzzy_match:
                        row = ImportRow(
                            import_log_id=log.id,
                            row_index=i,
                            status="duplicate_fuzzy",
                            raw_data=row_raw,
                            duplicate_of_id=fuzzy_match.id,
                        )
                        self.db.add(row)
                        duplicate_count += 1
                        rows_data.append(self._row_to_dict(row, fuzzy_match))
                        continue

                # Valid row → will be imported on confirm
                row = ImportRow(
                    import_log_id=log.id,
                    row_index=i,
                    status="imported",
                    raw_data=row_raw,
                )
                self.db.add(row)
                imported_count += 1
                rows_data.append(self._row_to_dict(row))

            except Exception as e:
                row = ImportRow(
                    import_log_id=log.id,
                    row_index=i,
                    status="rejected",
                    raw_data=row_raw,
                    reject_reason=str(e)[:500],
                )
                self.db.add(row)
                error_count += 1
                rows_data.append(self._row_to_dict(row))

        log.imported_count = imported_count
        log.duplicate_count = duplicate_count
        log.error_count = error_count
        await self.db.flush()

        return {
            "import_log_id": log.id,
            "format": fmt,
            "total_rows": len(parsed_txns),
            "to_import": imported_count,
            "duplicate_count": duplicate_count,
            "error_count": error_count,
            "rows": rows_data,
            "file_already_imported": file_already_imported,
        }

    # ── Phase 2: Confirm ─────────────────────────────────────────────

    async def confirm_import(
        self,
        user: User,
        import_log_id: int,
        account_id: int,
        forced_row_ids: list[int] | None = None,
    ) -> dict:
        """Create Transactions for rows with status='imported' or 'forced'."""
        forced_row_ids = forced_row_ids or []

        # Load import log
        result = await self.db.execute(
            select(ImportLog)
            .options(selectinload(ImportLog.rows))
            .where(ImportLog.id == import_log_id, ImportLog.user_id == user.id)
        )
        log = result.scalar_one_or_none()
        if not log:
            raise NotFoundError("Import")
        if log.status not in ("previewing",):
            raise ValidationError(f"Import déjà traité (status: {log.status}).")

        # Verify account ownership
        acc_result = await self.db.execute(select(Account).where(Account.id == account_id))
        account = acc_result.scalar_one_or_none()
        if not account or account.user_id != user.id:
            raise NotFoundError("Account")

        log.account_id = account_id
        log.status = "confirmed"

        # Mark forced rows
        forced_set = set(forced_row_ids)
        for row in log.rows:
            if row.id in forced_set and row.status in ("duplicate_exact", "duplicate_fuzzy"):
                row.status = "forced"

        # Re-parse file to get full data for transaction creation
        if not log.file_path:
            raise ValidationError("Fichier source introuvable.")
        content = self.file_service.read_file(log.file_path)

        ext = log.filename.rsplit(".", 1)[-1].lower() if "." in log.filename else ""
        parser_fn, fmt = _PARSERS.get(ext, (None, None))
        if not parser_fn:
            raise ValidationError(f"Format non supporté : .{ext}")

        parsed_txns: list[ParsedTransaction] = parser_fn(content)

        # Create transactions for importable rows
        imported = 0
        errors: list[str] = []
        hash_base_counts: dict[tuple[date, Decimal, str], int] = {}

        # Pre-compute hash counters to match preview order
        for pt in parsed_txns:
            label = pt.label or "(sans libellé)"
            label_norm = label.strip().lower()
            key = (pt.date, pt.amount, label_norm)
            hash_base_counts[key] = hash_base_counts.get(key, 0) + 1

        # Reset for actual processing
        hash_base_counts.clear()

        for row in sorted(log.rows, key=lambda r: r.row_index):
            if row.status not in ("imported", "forced"):
                continue

            if row.row_index >= len(parsed_txns):
                errors.append(f"Row {row.row_index}: index out of range")
                row.status = "rejected"
                row.reject_reason = "Row index out of range"
                continue

            pt = parsed_txns[row.row_index]
            try:
                label = pt.label or "(sans libellé)"
                label_norm = label.strip().lower()
                key = (pt.date, pt.amount, label_norm)
                hash_base_counts[key] = hash_base_counts.get(key, 0) + 1
                index = hash_base_counts[key]

                label_raw = label
                if pt.memo and pt.memo != label:
                    label_raw = f"{label} — {pt.memo}"

                if row.status == "forced":
                    dedup_hash = self._compute_hash(pt.date, pt.amount, label, index=index)
                    dedup_hash = f"{dedup_hash}_forced_{row.id}"
                else:
                    dedup_hash = self._compute_hash(pt.date, pt.amount, label, index=index)

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
                    import_log_id=log.id,
                )
                self.db.add(txn)
                await self.db.flush()
                row.transaction_id = txn.id
                imported += 1

            except Exception as e:
                errors.append(f"Row {row.row_index}: {e}")
                row.status = "rejected"
                row.reject_reason = str(e)[:500]

        log.imported_count = imported
        log.duplicate_count = sum(1 for r in log.rows if r.status in ("duplicate_exact", "duplicate_fuzzy"))
        log.error_count = sum(1 for r in log.rows if r.status == "rejected")
        log.errors_detail = {"errors": errors[:50]} if errors else None
        log.status = "done"
        await self.db.flush()

        return {
            "import_log_id": log.id,
            "total_rows": log.total_rows,
            "imported_count": imported,
            "duplicate_count": log.duplicate_count,
            "error_count": log.error_count,
            "errors": errors[:20] if errors else None,
        }

    # ── Cancel ────────────────────────────────────────────────────────

    async def cancel_import(self, user: User, import_log_id: int) -> None:
        """Cancel a previewing import."""
        result = await self.db.execute(
            select(ImportLog).where(ImportLog.id == import_log_id, ImportLog.user_id == user.id)
        )
        log = result.scalar_one_or_none()
        if not log:
            raise NotFoundError("Import")
        if log.status != "previewing":
            raise ValidationError(f"Seul un import en preview peut être annulé (status: {log.status}).")
        log.status = "cancelled"
        await self.db.flush()

    # ── History & Detail ──────────────────────────────────────────────

    async def get_import_history(
        self,
        user: User,
        account_id: int | None = None,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """Paginated import history."""
        query = select(ImportLog).where(ImportLog.user_id == user.id)
        if account_id:
            query = query.where(ImportLog.account_id == account_id)
        if status:
            query = query.where(ImportLog.status == status)
        query = query.order_by(ImportLog.created_at.desc())

        # Count
        from sqlalchemy import func
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        # Paginate
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        logs = result.scalars().all()

        return {
            "data": [self._log_to_dict(log) for log in logs],
            "meta": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "pages": (total + per_page - 1) // per_page if per_page else 1,
            },
        }

    async def get_import_detail(self, user: User, import_log_id: int) -> dict:
        """Full import detail with all rows."""
        result = await self.db.execute(
            select(ImportLog)
            .options(selectinload(ImportLog.rows))
            .where(ImportLog.id == import_log_id, ImportLog.user_id == user.id)
        )
        log = result.scalar_one_or_none()
        if not log:
            raise NotFoundError("Import")

        # Load duplicate transaction summaries
        dup_txn_ids = [r.duplicate_of_id for r in log.rows if r.duplicate_of_id]
        dup_txns = {}
        if dup_txn_ids:
            txn_result = await self.db.execute(
                select(Transaction).where(Transaction.id.in_(dup_txn_ids))
            )
            for txn in txn_result.scalars().all():
                dup_txns[txn.id] = {
                    "id": txn.id,
                    "date": txn.date.isoformat(),
                    "label": txn.label_raw,
                    "amount": str(txn.amount),
                }

        rows = []
        for row in sorted(log.rows, key=lambda r: r.row_index):
            d = self._row_to_dict(row)
            if row.duplicate_of_id and row.duplicate_of_id in dup_txns:
                d["duplicate_of_summary"] = dup_txns[row.duplicate_of_id]
            rows.append(d)

        return {
            "import_log": self._log_to_dict(log),
            "rows": rows,
            "file_downloadable": bool(log.file_path and self.file_service.file_exists(log.file_path)),
        }

    # ── Legacy single-phase import (kept for backward compat) ─────────

    async def import_file(
        self,
        user: User,
        account_id: int,
        filename: str,
        content: bytes,
    ) -> dict:
        """Single-phase import (legacy). Calls preview + confirm internally."""
        preview = await self.preview_import(user, filename, content, account_id=account_id)
        result = await self.confirm_import(user, preview["import_log_id"], account_id)
        return result

    # ── Helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _compute_hash(txn_date: date, amount: Decimal, label: str, index: int = 1) -> str:
        raw = f"{txn_date.isoformat()}|{amount}|{label.strip().lower()}|{index}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def _normalize_label_for_dedup(label: str) -> str:
        if not label:
            return ""
        s = label.strip().lower()
        s = re.sub(r"\s+", " ", s)
        return s

    async def _find_duplicate_fuzzy(
        self, account_id: int, txn_date: date, amount: Decimal, label_raw: str
    ) -> Transaction | None:
        """Find a fuzzy duplicate and return it (or None)."""
        normalized = self._normalize_label_for_dedup(label_raw)
        if not normalized:
            return None

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
                return txn
        return None

    @staticmethod
    def _row_to_dict(row: ImportRow, dup_txn: Transaction | None = None) -> dict:
        d = {
            "id": row.id,
            "row_index": row.row_index,
            "status": row.status,
            "raw_data": row.raw_data,
            "transaction_id": row.transaction_id,
            "duplicate_of_id": row.duplicate_of_id,
            "reject_reason": row.reject_reason,
        }
        if dup_txn:
            d["duplicate_of_summary"] = {
                "id": dup_txn.id,
                "date": dup_txn.date.isoformat(),
                "label": dup_txn.label_raw,
                "amount": str(dup_txn.amount),
            }
        return d

    @staticmethod
    def _log_to_dict(log: ImportLog) -> dict:
        return {
            "id": log.id,
            "account_id": log.account_id,
            "filename": log.filename,
            "format": log.format,
            "status": log.status,
            "total_rows": log.total_rows,
            "imported_count": log.imported_count,
            "duplicate_count": log.duplicate_count,
            "error_count": log.error_count,
            "file_size": log.file_size,
            "file_hash": log.file_hash,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
