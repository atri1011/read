from __future__ import annotations

import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait

import redis

from app.jobs import process_job
from app.logging_util import log_json
from app.settings import settings
from app.worker_pool import drain_finished, parse_job_payload


def main() -> None:
    concurrency = max(1, int(settings.concurrency))
    log_json(
        event="worker_start",
        queue=settings.queue_name,
        concurrency=concurrency,
    )
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    futures: set[Future[None]] = set()

    with ThreadPoolExecutor(
        max_workers=concurrency,
        thread_name_prefix="parse-job",
    ) as pool:
        while True:
            drain_finished(futures)

            if len(futures) >= concurrency:
                wait(futures, return_when=FIRST_COMPLETED)
                continue

            try:
                item = client.brpop(settings.queue_name, timeout=5)
            except redis.RedisError as exc:
                log_json(event="redis_error", error=str(exc), stage="brpop")
                time.sleep(2)
                continue

            if not item:
                continue

            _queue, raw = item
            parsed = parse_job_payload(raw)
            if not parsed:
                continue

            job_id, document_id = parsed
            log_json(
                event="job_dequeued",
                job_id=job_id,
                document_id=document_id,
                stage="dequeued",
                inflight=len(futures) + 1,
                concurrency=concurrency,
            )
            futures.add(pool.submit(process_job, job_id))


if __name__ == "__main__":
    main()
