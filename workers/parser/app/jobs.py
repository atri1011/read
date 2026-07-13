from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import Any

from app import db
from app.pdf_render import render_pdf_pages
from app.settings import settings
from app.text_import import load_text_file, to_markdown
from app.vision_llm import VisionLLMError, page_to_markdown


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


def _page_render_dir(document_id: str, job_id: str) -> Path:
    upload_root = Path(settings.upload_dir)
    try:
        base = upload_root / ".tmp" / "pdf-render"
        base.mkdir(parents=True, exist_ok=True)
        # Prefer shared upload volume so operators can inspect failures
        return Path(tempfile.mkdtemp(prefix=f"{document_id}-{job_id}-", dir=base.as_posix()))
    except OSError:
        return Path(tempfile.mkdtemp(prefix=f"pdf-render-{job_id}-"))


async def _pdf_pages_to_markdown(
    page_paths: list[Path],
    *,
    job_id: str,
    document_id: str,
    conn: Any,
) -> str:
    total = len(page_paths)
    if total == 0:
        raise JobError(
            "pdf_empty",
            "pdf has no pages",
            progress={"stage": "render", "page": 0, "total": 0},
        )

    parts: list[str] = []
    for index, image_path in enumerate(page_paths, start=1):
        progress = {"stage": "vision", "page": index, "total": total}
        db.set_job_progress(conn, job_id, progress)
        try:
            md = await page_to_markdown(image_path, index, total)
        except VisionLLMError as exc:
            # Keep any pages already converted so operators can inspect partial output
            if parts:
                partial = "\n\n---\n\n".join(parts) + "\n"
                try:
                    db.set_document_draft(conn, document_id, partial)
                except Exception:  # noqa: BLE001 — best-effort partial save
                    pass
            raise JobError(exc.code, exc.message, progress=progress) from exc
        parts.append(md.strip())

    return "\n\n---\n\n".join(parts) + "\n"


def _process_pdf(conn: Any, job_id: str, document_id: str, source: Path) -> tuple[str, int]:
    out_dir = _page_render_dir(document_id, job_id)
    try:
        db.set_job_progress(conn, job_id, {"stage": "render", "page": 0, "total": 0})
        try:
            page_paths = render_pdf_pages(source, out_dir)
        except Exception as exc:  # noqa: BLE001 — map render failures
            raise JobError(
                "pdf_render_failed",
                f"failed to rasterize pdf: {exc}",
                progress={"stage": "render"},
            ) from exc

        total = len(page_paths)
        db.set_job_progress(conn, job_id, {"stage": "render", "page": 0, "total": total})
        md = asyncio.run(
            _pdf_pages_to_markdown(
                page_paths,
                job_id=job_id,
                document_id=document_id,
                conn=conn,
            )
        )
        return md, total
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def process_job(job_id: str) -> None:
    with db.connect() as conn:
        row = db.get_job_with_document(conn, job_id)
        if not row:
            print(f"job {job_id}: not found, skipping", flush=True)
            return

        document_id = str(row["document_id"])
        filename = row["source_filename"] or ""
        lower = filename.lower()
        mime = (row["source_mime"] or "").lower()

        db.mark_job_running(conn, job_id)
        print(f"job {job_id}: running for document {document_id} ({filename})", flush=True)

        try:
            path = _source_path(row["source_path"])
            if not path.is_file():
                raise JobError("source_missing", f"file not found: {path}")

            if lower.endswith(".pdf") or mime == "application/pdf":
                md, total = _process_pdf(conn, job_id, document_id, path)
                db.set_document_review(conn, document_id, md)
                db.set_job_progress(
                    conn,
                    job_id,
                    {"stage": "done", "page": total, "total": total},
                )
                db.mark_job_succeeded(conn, job_id)
                print(f"job {job_id}: succeeded → review (pdf)", flush=True)
                return

            if not (lower.endswith(".txt") or lower.endswith(".md")):
                raise JobError(
                    "unsupported_type",
                    f"unsupported source type: {filename or row['source_mime']}",
                )

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
