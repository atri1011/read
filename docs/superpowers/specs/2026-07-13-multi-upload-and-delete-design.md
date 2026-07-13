# Multi-upload & Bookshelf Delete — Design

**Date:** 2026-07-13  
**Status:** Approved for implementation planning  
**Scope:** English Reader shelf (`apps/web`)

## Problem

1. Upload UI and API only handle a single file per action. Users who import several PDFs (or TXT/MD) must repeat the flow and are redirected into review after each success.
2. There is no way to remove a document from the personal shelf. Related rows cascade in the schema, but no `DELETE` route or UI exists, and uploaded source files are never unlinked.

## Goals

- Allow selecting or dropping **multiple** allowed files in one action.
- Keep the user on the **我的** shelf after upload; show per-file progress and a success/failure summary.
- Allow the **owner** to **hard-delete** a document from the personal shelf with a confirmation dialog.
- Reuse existing single-file upload pipeline; minimize backend surface area.

## Non-goals

- Batch upload API (`files[]`)
- Multi-select / bulk-delete toolbar
- Soft delete or “trash”
- Deleting other users’ public documents
- Cancelling in-flight Redis parse jobs on delete
- Changing allowed types or the 50MB per-file limit

## Approach

**Frontend loop + single-document DELETE (Approach A).**

- Multi-upload is client-side orchestration over the existing `POST /api/documents` (field name remains `file`).
- Delete is a new owner-only `DELETE /api/documents/[id]` that removes the DB row (cascade children) and best-effort unlinks `sourcePath`.

Rationale: reuses enqueue/parse logic, partial failures stay per-file, small change set.

## Behavior

### Multi-file upload

| Rule | Detail |
|------|--------|
| Entry points | `UploadDropzone` (shelf) and any `UploadButton` still used for upload |
| Selection | `<input multiple>` + drag-and-drop of multiple files |
| Types | Unchanged: `.txt`, `.md`, `.pdf` (client accept + server validation) |
| Size | Unchanged: ≤ 50MB per file |
| Request | One `POST /api/documents` per file (`FormData` key `file`) |
| Concurrency | Limited concurrency (implementation default: **2** parallel uploads) to avoid flooding worker/DB |
| Navigation | **Never** auto-navigate to review, even for a single file — always stay on shelf |
| Progress | Status text such as `上传中 2/5` |
| Completion | Reload shelf list; show summary (success count + failed filenames/errors) |
| Empty selection | No-op |

### Delete

| Rule | Detail |
|------|--------|
| Who | Logged-in owner only |
| Where UI | Personal shelf list (`scope=mine`) only; not on public tab |
| Confirm | Required: `确定删除《{title}》？此操作不可恢复。` |
| Effect | Hard delete document + cascaded revisions, parse jobs, annotations |
| Files | Best-effort `unlink` of upload under `sourcePath`; log and continue if missing/fails |
| UI after | Remove row from list (or reload); disable button while request in flight |

## API

### Unchanged: `POST /api/documents`

Single-file upload semantics remain the contract. Multi-upload does not change this endpoint.

### New: `DELETE /api/documents/[id]`

**Auth**

- 401 if not logged in
- 404 if document missing
- 403 if not owner

**Success**

- Delete DB row by id (owner-scoped check already done)
- Cascade handles `document_revisions`, `parse_jobs`, `annotations` (existing FKs)
- If `sourcePath` present, resolve via `resolveUploadPath` and attempt delete
- Response: `204 No Content` (preferred) or `{ ok: true }` — pick one in implementation and stick to it (**204**)

**Errors**

- JSON `{ error: string }` with appropriate status for auth/validation failures
- 500 only for unexpected DB failures

## UI components

### `UploadDropzone` / `UploadButton`

- Add `multiple` to the file input.
- Collect `FileList` → array; filter empty; upload each with shared helper if useful.
- State: `pending`, `progress { done, total }`, `error` / `failures[]`, clear on new pick.
- Drop handler uses all dropped files, not `[0]`.
- Copy: mention multi-file is supported (e.g. “可多选”).

### `DocumentList`

- New optional props, e.g. `onDelete?: (doc) => void` / `deletingId?: string | null` / `allowDelete?: boolean`.
- When `allowDelete` (mine tab only): each row shows a delete control that **stops propagation** so the row link does not navigate.
- Prefer `button` + confirm via `window.confirm` for MVP (no new dialog library required).

### `ShelfTabs`

- Pass delete handler for mine scope: `DELETE` then `load("mine")`.
- After multi-upload finishes (partial or full), call `load("mine")`.
- Wire upload completion callback from dropzone → parent reload (prop or shared refresh).

## Data / storage notes

- Schema already cascades children of `documents`; no migration required for delete.
- `saveUpload` returns a relative key; delete uses the same root via `resolveUploadPath`.
- Add `deleteUpload(relativeKey)` (or inline `fs.unlink`) next to `saveUpload` in `lib/storage.ts` for symmetry.
- In-flight worker jobs may still run after delete; they should no-op or fail harmlessly when the document row is gone. Out of scope to cancel Redis jobs.

## Error handling

| Case | Behavior |
|------|----------|
| One of N uploads fails | Continue remaining; list failures in summary |
| Network error mid-batch | Mark that file failed; continue if possible |
| Delete of non-owned / missing | Surface API error; list unchanged |
| Unlink fails | Log server-side; still return 204 if DB delete succeeded |

## Testing (implementation plan will detail)

- API: DELETE owner → 204 + row gone; non-owner → 403; anon → 401.
- API: POST still single-file (regression).
- UI logic (unit or light component): multi file list building; delete confirm cancel does not call API.
- Manual: multi PDF drop, mixed success/fail, delete published private doc with annotations.

## File touch list (expected)

- `apps/web/src/components/shelf/upload-dropzone.tsx`
- `apps/web/src/components/shelf/upload-button.tsx` (if still used)
- `apps/web/src/components/shelf/document-list.tsx`
- `apps/web/src/components/shelf/shelf-tabs.tsx`
- `apps/web/src/app/api/documents/[id]/route.ts` — add `DELETE`
- `apps/web/src/lib/storage.ts` — delete helper
- Optional shared client helper for upload one file

## Success criteria

1. User can select or drop multiple PDFs (and TXT/MD) and see them appear on the personal shelf without leaving the page.
2. Per-file failures do not block other files.
3. Owner can delete a document from 我的 after confirm; it disappears from the list and is gone from subsequent GETs.
4. Public shelf has no delete control; non-owners cannot delete via API.
