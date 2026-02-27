"""EVOL-002 acceptance tests — Extended import tracking.

Tests the two-phase import workflow: preview → confirm,
file storage, per-row tracking, dedup transparency, and force-import.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import ImportLog, ImportRow, Transaction
from app.services.import_service import ImportService
from app.services.file_service import FileService

from tests.conftest import SAMPLE_CSV_CONTENT, SAMPLE_CSV_CONTENT_OVERLAP


# ── AC1: Files are stored in the local file repository ──────

@pytest.mark.asyncio
async def test_file_stored_on_preview(db: AsyncSession, test_user, test_account):
    """Imported files are stored in {DATA_DIR}/imports/{user}/{YYYY}/{MM}/."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac1.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    log = await db.execute(select(ImportLog).where(ImportLog.id == preview["import_log_id"]))
    import_log = log.scalar_one()

    assert import_log.file_path is not None
    assert f"imports/{test_user.id}/" in import_log.file_path
    assert "test_ac1.csv" in import_log.file_path

    # File actually exists on disk
    fs = FileService()
    assert fs.file_exists(import_log.file_path)


# ── AC2: ImportLog records filePath, fileSize, fileHash ──────

@pytest.mark.asyncio
async def test_import_log_file_metadata(db: AsyncSession, test_user, test_account):
    """ImportLog records filePath, fileSize, fileHash."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac2.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    log = await db.execute(select(ImportLog).where(ImportLog.id == preview["import_log_id"]))
    import_log = log.scalar_one()

    assert import_log.file_path is not None
    assert import_log.file_size == len(SAMPLE_CSV_CONTENT)
    assert import_log.file_hash is not None
    assert len(import_log.file_hash) == 64  # SHA-256


# ── AC3: Each imported transaction has importLogId set ────────

@pytest.mark.asyncio
async def test_transaction_has_import_log_id(db: AsyncSession, test_user, test_account):
    """Each transaction created by import has importLogId set."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac3.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    result = await service.confirm_import(
        user=test_user,
        import_log_id=preview["import_log_id"],
        account_id=test_account.id,
    )

    assert result["imported_count"] == 5

    txns = await db.execute(
        select(Transaction).where(Transaction.import_log_id == preview["import_log_id"])
    )
    transactions = txns.scalars().all()
    assert len(transactions) == 5
    for txn in transactions:
        assert txn.import_log_id == preview["import_log_id"]


# ── AC4: Every row has a corresponding ImportRow record ──────

@pytest.mark.asyncio
async def test_every_row_has_import_row(db: AsyncSession, test_user, test_account):
    """Every row from an imported file has a corresponding ImportRow record."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac4.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    rows = await db.execute(
        select(ImportRow).where(ImportRow.import_log_id == preview["import_log_id"])
    )
    import_rows = rows.scalars().all()

    assert len(import_rows) == 5  # 5 rows in SAMPLE_CSV_CONTENT
    assert preview["total_rows"] == 5

    # Each row has a status
    for row in import_rows:
        assert row.status in ("imported", "duplicate_exact", "duplicate_fuzzy", "rejected", "forced")
        assert row.raw_data is not None
        assert "date" in row.raw_data
        assert "amount" in row.raw_data
        assert "label" in row.raw_data


# ── AC5: Duplicate rows record duplicateOfId ──────────────────

@pytest.mark.asyncio
async def test_duplicate_rows_record_duplicate_of_id(db: AsyncSession, test_user, test_account):
    """Duplicate rows record duplicateOfId pointing to the matched existing transaction."""
    service = ImportService(db)

    # First import — all new
    preview1 = await service.preview_import(
        user=test_user,
        filename="test_ac5_first.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    result1 = await service.confirm_import(
        user=test_user,
        import_log_id=preview1["import_log_id"],
        account_id=test_account.id,
    )
    assert result1["imported_count"] == 5

    # Second import with overlap — should detect duplicates
    preview2 = await service.preview_import(
        user=test_user,
        filename="test_ac5_overlap.csv",
        content=SAMPLE_CSV_CONTENT_OVERLAP,
        account_id=test_account.id,
    )

    # Find duplicate rows
    dup_rows_data = [r for r in preview2["rows"] if r["status"] in ("duplicate_exact", "duplicate_fuzzy")]
    assert len(dup_rows_data) >= 1  # At least "CARTE BOULANGERIE DU COIN" is a duplicate

    for dup in dup_rows_data:
        assert dup["duplicate_of_id"] is not None
        # The duplicate_of_id should point to a real transaction
        txn = await db.execute(select(Transaction).where(Transaction.id == dup["duplicate_of_id"]))
        assert txn.scalar_one_or_none() is not None


# ── AC8: User can force-import duplicate rows ────────────────

@pytest.mark.asyncio
async def test_force_import_duplicate_row(db: AsyncSession, test_user, test_account):
    """User can force-import individual duplicate rows via forced_row_ids."""
    service = ImportService(db)

    # First import
    preview1 = await service.preview_import(
        user=test_user,
        filename="test_ac8_first.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    await service.confirm_import(
        user=test_user,
        import_log_id=preview1["import_log_id"],
        account_id=test_account.id,
    )

    # Second import — same file
    preview2 = await service.preview_import(
        user=test_user,
        filename="test_ac8_second.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    # All should be duplicates
    dup_rows = [r for r in preview2["rows"] if r["status"] in ("duplicate_exact", "duplicate_fuzzy")]
    assert len(dup_rows) == 5

    # Force import the first one
    forced_id = dup_rows[0]["id"]
    result = await service.confirm_import(
        user=test_user,
        import_log_id=preview2["import_log_id"],
        account_id=test_account.id,
        forced_row_ids=[forced_id],
    )

    assert result["imported_count"] == 1  # Only the forced one

    # The forced row should have a transaction
    row = await db.execute(select(ImportRow).where(ImportRow.id == forced_id))
    forced_row = row.scalar_one()
    assert forced_row.status == "forced"
    assert forced_row.transaction_id is not None


# ── AC9: Forced rows get unique dedup_hash ────────────────────

@pytest.mark.asyncio
async def test_forced_row_unique_dedup_hash(db: AsyncSession, test_user, test_account):
    """Forced rows are created with a unique dedup_hash containing '_forced_'."""
    service = ImportService(db)

    # First import
    preview1 = await service.preview_import(
        user=test_user,
        filename="test_ac9_first.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    await service.confirm_import(
        user=test_user,
        import_log_id=preview1["import_log_id"],
        account_id=test_account.id,
    )

    # Re-import and force all
    preview2 = await service.preview_import(
        user=test_user,
        filename="test_ac9_second.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    dup_ids = [r["id"] for r in preview2["rows"] if r["status"] in ("duplicate_exact", "duplicate_fuzzy")]
    result = await service.confirm_import(
        user=test_user,
        import_log_id=preview2["import_log_id"],
        account_id=test_account.id,
        forced_row_ids=dup_ids,
    )
    assert result["imported_count"] == 5

    # Check dedup hashes contain _forced_
    txns = await db.execute(
        select(Transaction).where(Transaction.import_log_id == preview2["import_log_id"])
    )
    for txn in txns.scalars().all():
        assert "_forced_" in txn.dedup_hash


# ── AC12: Original file can be re-downloaded ──────────────────

@pytest.mark.asyncio
async def test_file_downloadable(db: AsyncSession, test_user, test_account):
    """Original file can be re-downloaded from import detail."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac12.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    await service.confirm_import(
        user=test_user,
        import_log_id=preview["import_log_id"],
        account_id=test_account.id,
    )

    detail = await service.get_import_detail(user=test_user, import_log_id=preview["import_log_id"])
    assert detail["file_downloadable"] is True

    # Read the stored file and compare content
    log = await db.execute(select(ImportLog).where(ImportLog.id == preview["import_log_id"]))
    import_log = log.scalar_one()
    fs = FileService()
    content = fs.read_file(import_log.file_path)
    assert content == SAMPLE_CSV_CONTENT


# ── AC13: Re-importing same file shows warning ───────────────

@pytest.mark.asyncio
async def test_reimport_same_file_warning(db: AsyncSession, test_user, test_account):
    """Re-importing the same file (by hash) shows a warning."""
    service = ImportService(db)

    # First import (complete it)
    preview1 = await service.preview_import(
        user=test_user,
        filename="test_ac13.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    assert preview1["file_already_imported"] is False
    await service.confirm_import(
        user=test_user,
        import_log_id=preview1["import_log_id"],
        account_id=test_account.id,
    )

    # Re-import same file
    preview2 = await service.preview_import(
        user=test_user,
        filename="test_ac13_again.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )
    assert preview2["file_already_imported"] is True


# ── AC14: Cancelling sets status to cancelled ─────────────────

@pytest.mark.asyncio
async def test_cancel_import(db: AsyncSession, test_user, test_account):
    """Cancelling an import sets status to 'cancelled' but preserves ImportRows and file."""
    service = ImportService(db)
    preview = await service.preview_import(
        user=test_user,
        filename="test_ac14.csv",
        content=SAMPLE_CSV_CONTENT,
        account_id=test_account.id,
    )

    await service.cancel_import(user=test_user, import_log_id=preview["import_log_id"])

    log = await db.execute(select(ImportLog).where(ImportLog.id == preview["import_log_id"]))
    import_log = log.scalar_one()
    assert import_log.status == "cancelled"

    # ImportRows still exist
    rows = await db.execute(
        select(ImportRow).where(ImportRow.import_log_id == preview["import_log_id"])
    )
    assert len(rows.scalars().all()) == 5

    # File still exists
    fs = FileService()
    assert fs.file_exists(import_log.file_path)


# ── Import history & detail ───────────────────────────────────

@pytest.mark.asyncio
async def test_import_history_lists_imports(db: AsyncSession, test_user, test_account):
    """Import history page lists all past imports with summary counts."""
    service = ImportService(db)

    # Create two imports
    p1 = await service.preview_import(test_user, "hist1.csv", SAMPLE_CSV_CONTENT, test_account.id)
    await service.confirm_import(test_user, p1["import_log_id"], test_account.id)

    p2 = await service.preview_import(test_user, "hist2.csv", SAMPLE_CSV_CONTENT_OVERLAP, test_account.id)
    await service.cancel_import(test_user, p2["import_log_id"])

    history = await service.get_import_history(user=test_user)
    assert history["meta"]["total"] >= 2

    filenames = [log["filename"] for log in history["data"]]
    assert "hist1.csv" in filenames
    assert "hist2.csv" in filenames


@pytest.mark.asyncio
async def test_import_detail_shows_all_rows(db: AsyncSession, test_user, test_account):
    """Import detail view includes all rows with their statuses."""
    service = ImportService(db)

    preview = await service.preview_import(test_user, "detail.csv", SAMPLE_CSV_CONTENT, test_account.id)
    await service.confirm_import(test_user, preview["import_log_id"], test_account.id)

    detail = await service.get_import_detail(user=test_user, import_log_id=preview["import_log_id"])

    assert detail["import_log"]["filename"] == "detail.csv"
    assert detail["import_log"]["status"] == "done"
    assert len(detail["rows"]) == 5
    assert detail["file_downloadable"] is True

    # All rows should have transaction_id set (all were imported)
    for row in detail["rows"]:
        assert row["status"] == "imported"
        assert row["transaction_id"] is not None


# ── Two-phase flow: confirm after preview ─────────────────────

@pytest.mark.asyncio
async def test_cannot_confirm_twice(db: AsyncSession, test_user, test_account):
    """An import cannot be confirmed twice."""
    service = ImportService(db)
    preview = await service.preview_import(test_user, "twice.csv", SAMPLE_CSV_CONTENT, test_account.id)
    await service.confirm_import(test_user, preview["import_log_id"], test_account.id)

    from app.core.exceptions import ValidationError
    with pytest.raises(ValidationError):
        await service.confirm_import(test_user, preview["import_log_id"], test_account.id)


@pytest.mark.asyncio
async def test_cannot_cancel_after_confirm(db: AsyncSession, test_user, test_account):
    """A confirmed import cannot be cancelled."""
    service = ImportService(db)
    preview = await service.preview_import(test_user, "cancel_late.csv", SAMPLE_CSV_CONTENT, test_account.id)
    await service.confirm_import(test_user, preview["import_log_id"], test_account.id)

    from app.core.exceptions import ValidationError
    with pytest.raises(ValidationError):
        await service.cancel_import(test_user, preview["import_log_id"])
