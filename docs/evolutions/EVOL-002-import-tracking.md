# EVOL-002 — Improve Import Tracking

| Field | Value |
|-------|-------|
| **ID** | EVOL-002 |
| **Title** | Improve import tracking for better fidelity |
| **Status** | Draft |
| **Created** | 2026-02-26 |
| **Target version** | TBD |
| **Priority** | Medium |
| **Impacts** | Backend (models, services, migration), Frontend (import UI) |

---

## 1. Context

The current import workflow (`ImportService`) processes files (CSV, Excel, OFX) and creates an `ImportLog` entry with summary counts (imported, duplicates, errors). However, the tracking is limited:

- `ImportLog.status` only ever writes `done` — the `pending`, `processing`, `error` states are defined but unused
- No per-transaction import tracking (which transactions came from which import)
- No ability to "undo" an import (delete all transactions from a specific import)
- No progress feedback during large file imports
- Fuzzy dedup results are not surfaced to the user

## 2. Goals

- Faithful tracking of import provenance: link each transaction to its source import
- Full use of the ImportLog state machine (pending → processing → done/error)
- Ability to review and rollback imports
- Better visibility into dedup decisions (exact vs fuzzy matches)

## 3. Proposed Changes

> **TODO**: Detail the specific model and service changes after discussion with the team.

### 3.1 Potential Model Changes

- Add `import_log_id` FK on `Transaction` → link each transaction to its source import
- Add `dedup_details` JSONB on `ImportLog` → store per-row dedup decisions
- Implement full state machine for `ImportLog.status`

### 3.2 Potential Service Changes

- `ImportService`: emit status transitions (pending → processing → done/error)
- Track which transactions were created by each import
- Add "rollback import" endpoint: soft-delete all transactions from a given import

### 3.3 Potential API Changes

- `DELETE /transactions/import/{import_id}` — rollback an import
- `GET /transactions/import/{import_id}` — list transactions from a specific import
- WebSocket or SSE for import progress tracking

## 4. Acceptance Criteria

> To be defined after detailed specification.

- [ ] Each transaction linked to its source import
- [ ] ImportLog state machine fully implemented
- [ ] Import rollback capability
- [ ] Dedup decisions visible to user
