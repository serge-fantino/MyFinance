# EVOL-002 — Extended Import Tracking & Review

| Field | Value |
|-------|-------|
| **ID** | EVOL-002 |
| **Title** | Extended import tracking with file storage, duplicate review & import history |
| **Status** | Proposed |
| **Created** | 2026-02-26 |
| **Updated** | 2026-02-27 |
| **Target version** | v0.3 |
| **Priority** | High |
| **Impacts** | Backend (models, services, migrations, file storage), Frontend (import dialog, import history page) |

---

## 1. Context

The current import workflow processes files (CSV, Excel, OFX) entirely in memory: the file is parsed, transactions are created, an `ImportLog` entry records summary counts, and the file is discarded. This has several limitations:

- **No file retention**: The original file is not stored — there is no way to re-inspect or re-process an import after the fact.
- **No per-transaction provenance**: Transactions have a `source` field (e.g. `import_csv`) but no link back to which specific import created them.
- **Opaque deduplication**: Duplicate counts are recorded in `ImportLog` but the user has no visibility into *which* rows were duplicated, *why* (exact hash vs fuzzy match), or *what* they matched against.
- **No user control over dedup**: Fuzzy dedup decisions are automatic; the user cannot override a false-positive duplicate detection.
- **No import history navigation**: No UI to browse past imports or review their content after the fact.

## 2. Goals

1. **Full import provenance**: Each transaction is linked to its source import, each import retains the original file.
2. **File repository**: Imported files are stored locally on disk with a structured path, and referenced from `ImportLog`.
3. **Transparent deduplication**: Every row from the imported file is tracked — imported, duplicate (with link to the matching original), or rejected (with reason).
4. **User control over dedup**: The import dialog previews all rows *before* final confirmation, letting the user force-import individual rows that were flagged as duplicates.
5. **Import history UX**: A dedicated view lists past imports with drill-down into their details (imported transactions, duplicates, errors).

## 3. New & Modified Domain Entities

### 3.1 ImportLog (modified)

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `filePath` | String | **NEW** | Relative path to the stored file in the local file repository |
| `fileSize` | Integer | **NEW** | Size of the imported file in bytes |
| `fileHash` | String(64) | **NEW** | SHA-256 hash of the file content (allows detecting re-import of same file) |
| `status` | ImportStatus | **CHANGED** | Actually used: `pending` → `previewing` → `confirmed` → `done` / `error` / `cancelled` |

New enum values for `ImportStatus`:

```
pending       → file uploaded, not yet parsed
previewing    → file parsed, preview shown to user, awaiting confirmation
confirmed     → user confirmed import, processing in progress
done          → import completed successfully
error         → import failed (partial or total)
cancelled     → user cancelled after preview
```

### 3.2 ImportRow (new entity)

Tracks every row from the imported file, regardless of outcome.

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer (PK) | |
| `importLogId` | FK → ImportLog | Parent import |
| `rowIndex` | Integer | 0-based position in the source file |
| `status` | ImportRowStatus | `imported` / `duplicate_exact` / `duplicate_fuzzy` / `rejected` / `forced` |
| `rawData` | JSONB | Original row data as parsed (date, amount, label, etc.) |
| `transactionId` | FK → Transaction [0..1] | The created transaction (if `imported` or `forced`) |
| `duplicateOfId` | FK → Transaction [0..1] | The existing transaction that caused dedup (if `duplicate_*`) |
| `rejectReason` | String [0..1] | Human-readable reason (if `rejected`: parse error, validation failure) |
| `createdAt` | DateTime | |

`ImportRowStatus` enum:
```
imported        → row successfully created a new Transaction
duplicate_exact → skipped: exact SHA-256 hash match with existing transaction
duplicate_fuzzy → skipped: fuzzy match (±7 days, same amount, similar label)
rejected        → skipped: parse error or validation failure
forced          → was flagged as duplicate but user forced import anyway
```

### 3.3 Transaction (modified)

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `importLogId` | FK → ImportLog [0..1] | **NEW** | Link to the source import (`null` for `manual` transactions) |

### 3.4 FileRepository (infrastructure concept, not a model)

A local directory structure for storing imported files. Not a database entity — an application-level convention managed by a service.

```
{DATA_DIR}/imports/
  └── {user_id}/
      └── {YYYY}/
          └── {MM}/
              └── {import_log_id}_{original_filename}
```

- `DATA_DIR` is configurable (default: `./data` or from env `MYFINANCE_DATA_DIR`)
- Files are stored as-is (no transformation)
- Retention policy: keep indefinitely (future: configurable cleanup)

## 4. Updated Class Diagram Fragment

```plantuml
class ImportLog <<entity>> #BBDEFB {
  filename : String
  format : String {csv,excel,ofx,qif}
  status : ImportStatus
  totalRows : Integer [0..1]
  importedCount : Integer [0..1]
  duplicateCount : Integer [0..1]
  errorCount : Integer [0..1]
  **filePath : String [0..1]**
  **fileSize : Integer [0..1]**
  **fileHash : String [0..1]**
}

class ImportRow <<entity>> #BBDEFB {
  rowIndex : Integer
  status : ImportRowStatus
  rawData : Map {JSONB}
  rejectReason : String [0..1]
}

enum ImportStatus <<enum>> #E8F4FD {
  pending
  previewing
  confirmed
  done
  error
  cancelled
}

enum ImportRowStatus <<enum>> #E8F4FD {
  imported
  duplicate_exact
  duplicate_fuzzy
  rejected
  forced
}

ImportLog "1" *-down- "0..*" ImportRow : rows >
ImportRow "0..1" -- "0..1" Transaction : created >
ImportRow "0..1" -- "0..1" Transaction : duplicate of >
Transaction "0..*" -- "0..1" ImportLog : imported by >
```

### New relationships

```
ImportLog    "1"    *-- "0..*"  ImportRow           : contains >
ImportRow    "0..1" --  "0..1"  Transaction         : created → transactionId
ImportRow    "0..1" --  "0..1"  Transaction         : duplicate of → duplicateOfId
Transaction  "0..*" -- "0..1"  ImportLog            : imported by → importLogId
```

## 5. Import Workflow (revised)

### 5.1 Lifecycle State Diagram

```
                ┌──────────┐
                │  Upload  │ User selects file
                └────┬─────┘
                     │
                ┌────▼─────┐
                │ pending   │ File saved to FileRepository
                └────┬─────┘
                     │
                ┌────▼─────────┐
                │ previewing    │ File parsed, ImportRows created
                │               │ with status: imported / duplicate_* / rejected
                │               │ Preview shown in import dialog
                └───┬──────┬───┘
                    │      │
           ┌────────▼┐   ┌─▼──────────┐
           │confirmed │   │ cancelled  │ User closes dialog
           └────┬─────┘   └────────────┘
                │
        ┌───────▼────────┐
        │  Processing     │ Create Transactions for rows with
        │                 │ status = imported | forced
        │                 │ Set ImportRow.transactionId
        └───┬─────────┬──┘
            │         │
       ┌────▼──┐  ┌───▼───┐
       │ done  │  │ error │ (partial: some rows failed)
       └───────┘  └───────┘
```

### 5.2 Detailed Flow

1. **Upload & Store**
   - User selects file → frontend sends to `POST /transactions/import/preview`
   - Backend saves file to `FileRepository` → records `filePath`, `fileSize`, `fileHash` on ImportLog
   - If `fileHash` already exists for this user → warn "this file was already imported on {date}"
   - ImportLog created with `status = pending`

2. **Parse & Preview**
   - File parsed into rows (using existing parsers: CSV, Excel, OFX)
   - For each row, run deduplication:
     - Compute `dedup_hash` → check exact match → `duplicate_exact` (record `duplicateOfId`)
     - If not exact → check fuzzy match → `duplicate_fuzzy` (record `duplicateOfId`)
     - If parse error → `rejected` (record `rejectReason`)
     - Otherwise → `imported` (pending creation)
   - Create `ImportRow` records with `rawData` and `status`
   - ImportLog `status = previewing`
   - Return preview result to frontend (list of rows with their statuses)

3. **User Review (frontend)**
   - Import dialog shows all rows grouped by status:
     - **To import** (status = `imported`): default expanded, green
     - **Duplicates** (status = `duplicate_exact` or `duplicate_fuzzy`): yellow, shows the matching original transaction
     - **Rejected** (status = `rejected`): red, shows reason
   - For each duplicate row, user can toggle **"Force import"** → status becomes `forced`
   - User clicks **"Confirm import"** or **"Cancel"**

4. **Confirm & Create**
   - Backend processes all rows with `status ∈ {imported, forced}`
   - Creates Transaction records, sets `ImportRow.transactionId` and `Transaction.importLogId`
   - Forced rows get a new unique `dedup_hash` (appended `_forced_{import_row_id}`)
   - ImportLog counts updated, `status = done`
   - Post-import automation: apply rules, compute embeddings (existing behavior)

5. **Cancel**
   - ImportLog `status = cancelled`
   - ImportRows remain for audit trail (no Transactions created)
   - File remains in FileRepository (user can re-import later from import history)

## 6. UX Specifications

### 6.1 Import Dialog (enhanced)

The existing 3-step dialog is extended:

| Step | Current | EVOL-002 |
|------|---------|----------|
| 1. File selection | File picker + account | Unchanged |
| 2. OFX confirm | OFX bank info + account action | Unchanged (OFX only) |
| 3. **Preview** | — | **NEW**: Table of all rows with status, dedup toggle |
| 4. Result | Summary counts | Enhanced: link to import detail page |

#### Step 3 — Preview (new)

```
┌──────────────────────────────────────────────────────────────────┐
│  Import Preview — fichier_banque_2026-02.csv                     │
│                                                                  │
│  📊 42 rows parsed: 38 to import, 3 duplicates, 1 error         │
│                                                                  │
│  ┌─ To import (38) ──────────────────────────────────────────┐   │
│  │ # │ Date       │ Label                    │ Amount │       │   │
│  │ 1 │ 2026-02-01 │ CARTE BOULANGERIE DU...  │ -4.50  │       │   │
│  │ 2 │ 2026-02-01 │ VIR SEPA SALAIRE         │ +2800  │       │   │
│  │ …                                                         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Duplicates (3) ──────────────────────────────────────────┐   │
│  │ # │ Date       │ Label              │ Amount │ Match type  │   │
│  │ 5 │ 2026-01-30 │ PRLV SEPA EDF      │ -85.00 │ Exact    [☐]│  │
│  │ 8 │ 2026-02-03 │ CB AMAZON          │ -29.99 │ Fuzzy    [☐]│  │
│  │ 12│ 2026-02-05 │ VIR LOYER          │ -750   │ Fuzzy    [☐]│  │
│  │                                                            │   │
│  │   ↳ Matching: "VIR LOYER" on 2026-02-04 (id: 4521)       │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Errors (1) ──────────────────────────────────────────────┐   │
│  │ Row 15: Invalid date format "31/02/2026"                   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Cancel]                                        [Confirm Import]│
└──────────────────────────────────────────────────────────────────┘
```

- Checkbox `[☐]` on each duplicate row = **force import** toggle
- Clicking a duplicate row shows the matching original transaction details
- Fuzzy duplicates show the match reason (date window, label similarity)

### 6.2 Import History Page (new)

Accessible from the main navigation (e.g. sidebar → "Imports" or from Account detail).

```
┌──────────────────────────────────────────────────────────────────┐
│  Import History                                                  │
│                                                                  │
│  Filter: [All accounts ▼]  [All statuses ▼]  [Date range ...]  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Date       │ File                    │ Account │ Rows │ Imp │ Dup │ Status │ │
│  │ 2026-02-27 │ banque_fev2026.csv      │ Courant │  42  │  38 │   3 │ done   │▸│
│  │ 2026-02-15 │ releve_jan2026.ofx      │ Courant │  65  │  60 │   5 │ done   │▸│
│  │ 2026-02-01 │ test.csv                │ Courant │  10  │   0 │   0 │ cancel │ │
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

Clicking an import row opens the **Import Detail** view, which is essentially the same preview layout from Step 3 (read-only), showing:

- All imported transactions (with links to transaction list)
- All duplicates (with links to the matched originals)
- All errors
- File metadata (filename, size, format, date, file hash)
- Option to **re-download** the original file

## 7. API Changes

### 7.1 Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/transactions/import/preview` | Returns `ImportPreviewResult` with full row-by-row preview + `importLogId` |
| `POST` | `/transactions/import` | Renamed to `/transactions/import/confirm`. Accepts `importLogId` + list of `forcedRowIds`. No longer receives file. |

### 7.2 New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/imports` | List import history (paginated, filterable by account, status, date range) |
| `GET` | `/imports/{id}` | Import detail: ImportLog + all ImportRows |
| `GET` | `/imports/{id}/file` | Download original imported file |
| `DELETE` | `/imports/{id}` | Cancel a `previewing` import / soft-delete a completed import |
| `PATCH` | `/imports/{id}/rows/{rowId}` | Toggle force-import on a duplicate row (during preview) |

### 7.3 New Schemas

```python
class ImportRowResponse(BaseModel):
    id: int
    row_index: int
    status: str  # imported, duplicate_exact, duplicate_fuzzy, rejected, forced
    raw_data: dict  # {date, amount, label, ...}
    transaction_id: int | None
    duplicate_of_id: int | None
    duplicate_of_summary: dict | None  # {date, label, amount} of the matched transaction
    reject_reason: str | None

class ImportPreviewResult(BaseModel):
    import_log_id: int
    format: str
    total_rows: int
    to_import: int
    duplicate_count: int
    error_count: int
    rows: list[ImportRowResponse]
    file_already_imported: bool  # true if fileHash matches an existing import
    file_account_info: dict | None  # OFX only
    file_balance_info: dict | None  # OFX only

class ImportConfirmRequest(BaseModel):
    import_log_id: int
    forced_row_ids: list[int] = []  # ImportRow IDs to force-import despite duplicate status
    account_id: int | None = None
    account_action: str = "use"
    new_account_name: str | None = None
    apply_balance_reference: bool = False

class ImportDetailResponse(BaseModel):
    import_log: ImportLogResponse
    rows: list[ImportRowResponse]
    file_downloadable: bool

class ImportLogResponse(BaseModel):
    id: int
    account_id: int
    filename: str
    format: str
    status: str
    total_rows: int | None
    imported_count: int | None
    duplicate_count: int | None
    error_count: int | None
    file_size: int | None
    file_hash: str | None
    created_at: datetime
```

## 8. Service Changes

### 8.1 FileService (new)

Manages the local file repository.

| Method | Description |
|--------|-------------|
| `store_file(user_id, import_log_id, filename, content) → str` | Save file to disk, return relative path |
| `get_file_path(relative_path) → Path` | Resolve full path from relative path |
| `read_file(relative_path) → bytes` | Read file content |
| `delete_file(relative_path)` | Remove file from disk |
| `compute_hash(content) → str` | SHA-256 hash of file content |

### 8.2 ImportService (modified)

Current single `import_file()` method is split into two phases:

| Method | Description |
|--------|-------------|
| `preview_import(user_id, account_id, file) → ImportPreviewResult` | Parse file, create ImportLog + ImportRows, store file, return preview |
| `confirm_import(import_log_id, forced_row_ids) → ImportResult` | Create Transactions for `imported` + `forced` rows, update ImportLog |
| `cancel_import(import_log_id)` | Set ImportLog status to `cancelled` |
| `get_import_history(user_id, filters) → list[ImportLog]` | Paginated import history |
| `get_import_detail(import_log_id) → ImportDetailResponse` | Full detail with all rows |

### 8.3 TransactionService (minor)

- Query transactions filtered by `importLogId` (for import detail drill-down)

## 9. Migration Plan

### Migration 018: `018_import_tracking_evol002.py`

1. **Create `import_rows` table** with all fields from section 3.2
2. **Add columns to `import_logs`**: `file_path`, `file_size`, `file_hash`
3. **Add column to `transactions`**: `import_log_id` FK → `import_logs.id` (nullable, `ondelete=SET NULL`)
4. **Add indexes**:
   - `idx_import_rows_import_log_id` on `import_rows.import_log_id`
   - `idx_import_rows_transaction_id` on `import_rows.transaction_id`
   - `idx_import_rows_duplicate_of_id` on `import_rows.duplicate_of_id`
   - `idx_transactions_import_log_id` on `transactions.import_log_id`
   - `idx_import_logs_file_hash` on `import_logs.file_hash`
5. **No backfill**: Existing transactions have `import_log_id = NULL` (provenance unknown for historical imports). New imports will populate the field.

## 10. Implementation Plan

### Phase 1 — Backend foundation
1. Alembic migration 018
2. `ImportRow` model
3. `ImportLog` model updates (new fields)
4. `Transaction` model update (`import_log_id`)
5. `FileService` implementation
6. Config: `MYFINANCE_DATA_DIR` env variable

### Phase 2 — Two-phase import
7. Refactor `ImportService.import_file()` → `preview_import()` + `confirm_import()`
8. Update dedup logic to create `ImportRow` records with match details
9. Handle `forced` rows (unique hash generation)
10. Update preview endpoint to return row-level results
11. New `/transactions/import/confirm` endpoint
12. New `/imports` CRUD endpoints

### Phase 3 — Frontend
13. Enhance `ImportModal.tsx` with Step 3 (preview table with dedup toggles)
14. Create `ImportHistoryPage.tsx` (list + detail views)
15. Add "Imports" entry in sidebar navigation
16. Link import detail to transaction list (filtered view)

### Phase 4 — Polish
17. File re-download endpoint
18. "Already imported" warning (file hash check)
19. Import cancellation flow
20. Unit tests for `FileService`, `ImportService` new methods

## 11. Acceptance Criteria

- [ ] Imported files are stored in the local file repository under `{DATA_DIR}/imports/{user_id}/{YYYY}/{MM}/`
- [ ] `ImportLog` records `filePath`, `fileSize`, `fileHash`
- [ ] Each transaction created by import has `importLogId` set
- [ ] Every row from an imported file has a corresponding `ImportRow` record
- [ ] Duplicate rows record `duplicateOfId` pointing to the matched existing transaction
- [ ] Rejected rows record `rejectReason`
- [ ] Import dialog shows preview with all rows grouped by status before confirmation
- [ ] User can force-import individual duplicate rows via checkbox toggle
- [ ] Forced rows are created with a unique `dedup_hash` and `status = forced`
- [ ] Import history page lists all past imports with summary counts
- [ ] Clicking an import opens a detail view with all rows and their statuses
- [ ] Original file can be re-downloaded from import detail
- [ ] Re-importing the same file (by hash) shows a warning
- [ ] Cancelling an import sets status to `cancelled` but preserves ImportRows and file
