from __future__ import annotations

import json
import time

import redis

from app.jobs import process_job
from app.logging_util import log_json
from app.settings import settings


def main() -> None:
    log_json(
        event="worker_start",
        queue=settings.queue_name,
        concurrency=settings.concurrency,
    )
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    while True:
        try:
            item = client.brpop(settings.queue_name, timeout=5)
        except redis.RedisError as exc:
            log_json(event="redis_error", error=str(exc), stage="brpop")
            time.sleep(2)
            continue

        if not item:
            continue

        _queue, raw = item
        try:
            payload = json.loads(raw)
            job_id = payload.get("jobId") or payload.get("job_id")
            document_id = payload.get("documentId") or payload.get("document_id")
            if not job_id:
                log_json(
                    event="invalid_payload",
                    error="missing_job_id",
                    raw=raw[:500],
                )
                continue
        except json.JSONDecodeError as exc:
            log_json(
                event="invalid_payload",
                error="invalid_json",
                detail=str(exc),
                raw=raw[:500],
            )
            continue

        log_json(
            event="job_dequeued",
            job_id=str(job_id),
            document_id=str(document_id) if document_id else None,
            stage="dequeued",
        )
        # concurrency=1: process sequentially in this loop
        process_job(str(job_id))


if __name__ == "__main__":
    main()
