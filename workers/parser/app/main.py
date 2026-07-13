from __future__ import annotations

import json
import time

import redis

from app.jobs import process_job
from app.settings import settings


def main() -> None:
    print(
        "parser worker starting",
        settings.queue_name,
        "concurrency=",
        settings.concurrency,
        flush=True,
    )
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    while True:
        try:
            item = client.brpop(settings.queue_name, timeout=5)
        except redis.RedisError as exc:
            print(f"redis error: {exc}; retrying in 2s", flush=True)
            time.sleep(2)
            continue

        if not item:
            continue

        _queue, raw = item
        try:
            payload = json.loads(raw)
            job_id = payload.get("jobId") or payload.get("job_id")
            if not job_id:
                print(f"invalid payload (no jobId): {raw!r}", flush=True)
                continue
        except json.JSONDecodeError:
            print(f"invalid json payload: {raw!r}", flush=True)
            continue

        # concurrency=1: process sequentially in this loop
        process_job(str(job_id))


if __name__ == "__main__":
    main()
