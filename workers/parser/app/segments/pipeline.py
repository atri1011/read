from __future__ import annotations

import asyncio
from typing import Any, Callable

from app.segments.align import align_markdown
from app.segments.segment import sanitize_markdown
from app.segments.translate import fill_missing_targets
from app.segments.verify import alignment_suspicion, realign_pairs
from app.settings import settings


ProgressCb = Callable[[dict[str, Any]], None]


async def _async_llm_stages(
    segments: list[dict[str, Any]],
    *,
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    """Run realign (if needed) then translate in one event loop."""
    suspicion = alignment_suspicion(segments)
    if suspicion["needs_realign"] or settings.bilingual_always_realign:
        if on_progress:
            on_progress(
                {
                    "stage": "realign",
                    "page": 0,
                    "total": len(segments),
                    "extracted": suspicion.get("extracted", 0),
                    "bad": suspicion.get("bad", 0),
                }
            )
        try:
            segments = await realign_pairs(segments, on_progress=on_progress)
        except Exception:  # noqa: BLE001 — fail-soft
            pass

    missing = sum(1 for s in segments if not (s.get("target") or "").strip())
    if missing == 0:
        if on_progress:
            on_progress({"stage": "translate", "page": 0, "total": 0})
        return segments

    try:
        segments = await fill_missing_targets(segments, on_progress=on_progress)
    except Exception:  # noqa: BLE001 — fail-soft
        pass
    return segments


def build_and_translate(
    markdown: str,
    *,
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    """
    Sanitize → align segments → optional LLM realign → LLM-fill missing Chinese targets.
    Fail-soft on LLM errors (returns partial targets).
    """
    if on_progress:
        on_progress({"stage": "segment", "page": 0, "total": 0})

    cleaned = sanitize_markdown(markdown)
    segments = align_markdown(cleaned)
    if not segments:
        return []

    try:
        segments = asyncio.run(
            _async_llm_stages(segments, on_progress=on_progress)
        )
    except Exception:  # noqa: BLE001 — fail-soft entire LLM stage
        pass

    filled = sum(1 for s in segments if (s.get("target") or "").strip())
    missing = sum(1 for s in segments if not (s.get("target") or "").strip())
    if on_progress:
        on_progress(
            {
                "stage": "translate",
                "page": filled,
                "total": max(filled + missing, filled),
            }
        )
    return segments
