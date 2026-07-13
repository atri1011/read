from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from app.settings import settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn


def get_job_with_document(conn: psycopg.Connection, job_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              j.id AS job_id,
              j.document_id,
              j.status AS job_status,
              j.attempts,
              j.progress,
              j.error AS job_error,
              d.id AS document_id,
              d.owner_id,
              d.title,
              d.status AS document_status,
              d.source_mime,
              d.source_filename,
              d.source_path,
              d.draft_markdown,
              d.error_message
            FROM parse_jobs j
            JOIN documents d ON d.id = j.document_id
            WHERE j.id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def mark_job_running(conn: psycopg.Connection, job_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE parse_jobs
            SET status = 'running',
                attempts = attempts + 1,
                started_at = COALESCE(started_at, %s),
                progress = COALESCE(progress, '{}'::jsonb)
            WHERE id = %s
            """,
            (_now(), job_id),
        )
    conn.commit()


def set_job_progress(
    conn: psycopg.Connection,
    job_id: str,
    progress: dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE parse_jobs
            SET progress = %s
            WHERE id = %s
            """,
            (Json(progress), job_id),
        )
    conn.commit()


def mark_job_succeeded(conn: psycopg.Connection, job_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE parse_jobs
            SET status = 'succeeded',
                finished_at = %s,
                error = NULL
            WHERE id = %s
            """,
            (_now(), job_id),
        )
    conn.commit()


def mark_job_failed(
    conn: psycopg.Connection,
    job_id: str,
    error: dict[str, Any],
    progress: dict[str, Any] | None = None,
) -> None:
    with conn.cursor() as cur:
        if progress is None:
            cur.execute(
                """
                UPDATE parse_jobs
                SET status = 'failed',
                    finished_at = %s,
                    error = %s
                WHERE id = %s
                """,
                (_now(), Json(error), job_id),
            )
        else:
            cur.execute(
                """
                UPDATE parse_jobs
                SET status = 'failed',
                    finished_at = %s,
                    error = %s,
                    progress = %s
                WHERE id = %s
                """,
                (_now(), Json(error), Json(progress), job_id),
            )
    conn.commit()


def set_document_review(
    conn: psycopg.Connection,
    document_id: str | UUID,
    draft_markdown: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documents
            SET status = 'review',
                draft_markdown = %s,
                error_message = NULL,
                updated_at = %s
            WHERE id = %s
            """,
            (draft_markdown, _now(), document_id),
        )
    conn.commit()


def set_document_failed(
    conn: psycopg.Connection,
    document_id: str | UUID,
    message: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documents
            SET status = 'failed',
                error_message = %s,
                updated_at = %s
            WHERE id = %s
            """,
            (message, _now(), document_id),
        )
    conn.commit()
