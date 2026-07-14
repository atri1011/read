from __future__ import annotations

import json
from concurrent.futures import Future
from typing import Any

from app.logging_util import log_json


def parse_job_payload(raw: str) -> tuple[str, str | None] | None:
    """Parse Redis queue payload into (job_id, document_id)."""
    try:
        payload: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        log_json(
            event="invalid_payload",
            error="invalid_json",
            detail=str(exc),
            raw=raw[:500],
        )
        return None

    job_id = payload.get("jobId") or payload.get("job_id")
    document_id = payload.get("documentId") or payload.get("document_id")
    if not job_id:
        log_json(
            event="invalid_payload",
            error="missing_job_id",
            raw=raw[:500],
        )
        return None
    return str(job_id), str(document_id) if document_id else None


def drain_finished(futures: set[Future[None]]) -> None:
    """Remove completed futures; log unexpected exceptions from workers."""
    done = {f for f in futures if f.done()}
    for fut in done:
        futures.discard(fut)
        try:
            fut.result()
        except Exception as exc:  # noqa: BLE001 — worker boundary
            log_json(
                event="job_unhandled_error",
                error=str(exc),
                stage="executor",
            )
