"""Import history & detail API routes."""

import structlog
from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.transaction import (
    ImportDetailResponse,
    ImportHistoryResponse,
)
from app.services.import_service import ImportService

logger = structlog.get_logger()

router = APIRouter()


@router.get("", response_model=ImportHistoryResponse)
async def list_imports(
    account_id: int | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List import history with pagination and filters."""
    service = ImportService(db)
    return await service.get_import_history(
        user=current_user,
        account_id=account_id,
        status=status,
        page=page,
        per_page=per_page,
    )


@router.get("/{import_id}", response_model=ImportDetailResponse)
async def get_import_detail(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full import detail with all rows."""
    service = ImportService(db)
    return await service.get_import_detail(user=current_user, import_log_id=import_id)


@router.get("/{import_id}/file")
async def download_import_file(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the original imported file."""
    service = ImportService(db)
    detail = await service.get_import_detail(user=current_user, import_log_id=import_id)
    if not detail["file_downloadable"]:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("File")

    log = detail["import_log"]
    from app.services.file_service import FileService
    fs = FileService()

    # Get the import log to access file_path
    from sqlalchemy import select
    from app.models.transaction import ImportLog
    result = await db.execute(
        select(ImportLog).where(ImportLog.id == import_id, ImportLog.user_id == current_user.id)
    )
    import_log = result.scalar_one_or_none()
    if not import_log or not import_log.file_path:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("File")

    # Read original content (handles compression internally) and stream it back
    content = fs.read_file(import_log.file_path)
    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{import_log.filename}"'},
    )


@router.delete("/{import_id}", status_code=204)
async def cancel_import(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a previewing import (set status to cancelled)."""
    service = ImportService(db)
    await service.cancel_import(user=current_user, import_log_id=import_id)


@router.delete("/{import_id}/draft", status_code=204)
async def delete_import_draft(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a draft import (previewing or cancelled): file, log and rows. Frees quota."""
    service = ImportService(db)
    await service.delete_import_draft(user=current_user, import_log_id=import_id)


@router.delete("/{import_id}/file", status_code=204)
async def delete_import_file(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the stored source file for an import (keeps history and transactions)."""
    service = ImportService(db)
    await service.delete_import_file(user=current_user, import_log_id=import_id)


@router.post("/{import_id}/rows/{row_id}/force")
async def force_import_row(
    import_id: int,
    row_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Force-import a duplicate row a posteriori (creates the transaction from raw_data)."""
    service = ImportService(db)
    return await service.force_import_row(user=current_user, import_log_id=import_id, row_id=row_id)
