from __future__ import annotations

from pathlib import Path
from typing import Any

from app import db
from app.settings import settings
from app.text_import import load_text_file, to_markdown


class JobError(Exception):
    def __init__(self, code: str, message: str, *, progress: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.progress = progress or {}


def _source_path(relative: str | None) -> Path:
    if not relative:
        raise JobError("missing_source", "document has no source_path")
    root = Path(settings.upload_dir).resolve()
    full = (root / relative).resolve()
    try:
        full.relative_to(root)
    except ValueError as exc:
        raise JobError(
            "invalid_source_path",
            "source_path escapes upload root",
        ) from exc
    return full


def process_job(job_id: str) -> None:
    with db.connect() as conn:
        row = db.get_job_with_document(conn, job_id)
        if not row:
            print(f"job {job_id}: not found, skipping", flush=True)
            return

        document_id = str(row["document_id"])
        filename = row["source_filename"] or ""
        lower = filename.lower()

        db.mark_job_running(conn, job_id)
        print(f"job {job_id}: running for document {document_id} ({filename})", flush=True)

        try:
            if lower.endswith(".pdf") or (row["source_mime"] or "").lower() == "application/pdf":
                progress = {"stage": "awaiting_pdf_pipeline"}
                db.set_job_progress(conn, job_id, progress)
                raise JobError(
                    "pdf_not_implemented",
                    "pdf pipeline not implemented",
                    progress=progress,
                )

            if not (lower.endswith(".txt") or lower.endswith(".md")):
                raise JobError(
                    "unsupported_type",
                    f"unsupported source type: {filename or row['source_mime']}",
                )

            path = _source_path(row["source_path"])
            if not path.is_file():
                raise JobError("source_missing", f"file not found: {path}")

            db.set_job_progress(conn, job_id, {"stage": "importing_text"})
            text = load_text_file(path)
            md = to_markdown(text, filename)
            db.set_document_review(conn, document_id, md)
            db.mark_job_succeeded(conn, job_id)
            print(f"job {job_id}: succeeded → review", flush=True)

        except JobError as exc:
            db.mark_job_failed(
                conn,
                job_id,
                {"code": exc.code, "message": exc.message},
                progress=exc.progress or None,
            )
            db.set_document_failed(conn, document_id, exc.message)
            print(f"job {job_id}: failed {exc.code}: {exc.message}", flush=True)

        except Exception as exc:  # noqa: BLE001 — worker boundary
            db.mark_job_failed(
                conn,
                job_id,
                {"code": "internal_error", "message": str(exc)},
            )
            db.set_document_failed(conn, document_id, "parse failed")
            print(f"job {job_id}: internal error: {exc}", flush=True)
