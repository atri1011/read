from __future__ import annotations

import asyncio
from typing import Any, Callable

from app.segments.align import align_markdown
from app.segments.translate import fill_missing_targets


ProgressCb = Callable[[dict[str, Any]], None]


def build_and_translate(
    markdown: str,
    *,
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    """
    Align segments from markdown, then LLM-fill missing Chinese targets.
    Fail-soft on translate errors (returns partial targets).
    """
    if on_progress:
        on_progress({"stage": "segment", "page": 0, "total": 0})

    segments = align_markdown(markdown)
    if not segments:
        return []

    missing = sum(1 for s in segments if not (s.get("target") or "").strip())
    if missing == 0:
        if on_progress:
            on_progress({"stage": "translate", "page": 0, "total": 0})
        return segments

    try:
        segments = asyncio.run(
            fill_missing_targets(segments, on_progress=on_progress)
        )
    except Exception:  # noqa: BLE001 — fail-soft
        pass

    filled = sum(1 for s in segments if (s.get("target") or "").strip())
    if on_progress:
        on_progress(
            {
                "stage": "translate",
                "page": filled,
                "total": max(missing, filled),
            }
        )
    return segments
