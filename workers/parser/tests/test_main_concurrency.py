from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor

from app.worker_pool import drain_finished, parse_job_payload


def test_parse_payload_accepts_camel_and_snake() -> None:
    job_id, doc_id = parse_job_payload('{"jobId":"j1","documentId":"d1"}')  # type: ignore[misc]
    assert job_id == "j1"
    assert doc_id == "d1"

    job_id2, doc_id2 = parse_job_payload('{"job_id":"j2","document_id":"d2"}')  # type: ignore[misc]
    assert job_id2 == "j2"
    assert doc_id2 == "d2"


def test_parse_payload_rejects_invalid() -> None:
    assert parse_job_payload("not-json") is None
    assert parse_job_payload("{}") is None
    assert parse_job_payload('{"documentId":"only"}') is None


def test_drain_finished_removes_done_futures() -> None:
    futures: set[Future[None]] = set()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures.add(pool.submit(lambda: None))
        futures.add(pool.submit(lambda: None))
        for f in list(futures):
            f.result(timeout=2)
        drain_finished(futures)
        assert futures == set()


def test_worker_pool_runs_jobs_in_parallel() -> None:
    """Two jobs under concurrency=2 finish faster than sequential."""
    live = {"n": 0, "max": 0}

    def fake_process(_job_id: str) -> None:
        live["n"] += 1
        live["max"] = max(live["max"], live["n"])
        time.sleep(0.15)
        live["n"] -= 1

    jobs = ["a", "b"]
    concurrency = 2
    futures: set[Future[None]] = set()
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        for job_id in jobs:
            futures.add(pool.submit(fake_process, job_id))
        while futures:
            drain_finished(futures)
            if futures:
                time.sleep(0.01)
    elapsed = time.monotonic() - t0

    assert live["max"] == 2
    # Parallel: ~0.15s; sequential would be ~0.30s
    assert elapsed < 0.28
