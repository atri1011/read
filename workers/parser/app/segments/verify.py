from __future__ import annotations

import json
import re
from typing import Any, Callable

import httpx

from app.segments.segment import cjk_ratio
from app.settings import settings

ProgressCb = Callable[[dict[str, Any]], None]

# Length ratio band for extracted pairs (CJK is denser than EN).
_MIN_RATIO = 0.15
_MAX_RATIO = 2.5
_MIN_EXTRACTED_FOR_RATIO = 3
_BAD_RATIO_FRACTION = 0.25

SYSTEM = """You verify and repair English-Chinese sentence pairs for a language-learning reader.

You receive a list of pairs: {id, source, target}.
Some targets may be misaligned (shifted, swapped, or attached to the wrong source).

Task:
1. Read all sources and all targets.
2. Reassign each non-empty target to the source it actually translates.
3. If a target does not match any source well, set target to "" for that id.
4. Do not invent new English sources. Do not merge/split ids. Keep the same id set.
5. Do not rewrite source text. Prefer the original Chinese wording when reassigning; only lightly normalize whitespace.
6. Output JSON only:
{"pairs":[{"id":"s-0","target":"..."}, ...]}
- Include every input id exactly once.
- target may be empty string.
- No commentary."""


class RealignError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _length_ratio(src: str, tgt: str) -> float:
    return len(tgt) / max(len(src), 1)


def is_bad_pair(src: str, tgt: str) -> bool:
    """True when a non-empty target looks length-misaligned with source."""
    if not (tgt or "").strip():
        return False
    r = _length_ratio(src, tgt)
    return r < _MIN_RATIO or r > _MAX_RATIO


def alignment_suspicion(segments: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Cheap heuristic: flag documents whose extracted pairs look shifted.
    Returns {needs_realign, extracted, bad, reasons}.
    """
    extracted: list[dict[str, Any]] = []
    for s in segments:
        tgt = (s.get("target") or "").strip()
        if not tgt:
            continue
        extracted.append(s)

    reasons: list[str] = []
    bad_flags: list[bool] = []
    for s in extracted:
        bad = is_bad_pair(s.get("source") or "", s.get("target") or "")
        bad_flags.append(bad)

    bad_count = sum(1 for b in bad_flags if b)
    extracted_count = len(extracted)
    needs = False

    if settings.bilingual_always_realign and extracted_count > 0:
        needs = True
        reasons.append("always_realign")

    if extracted_count >= _MIN_EXTRACTED_FOR_RATIO:
        if bad_count / extracted_count >= _BAD_RATIO_FRACTION:
            needs = True
            reasons.append("bad_ratio_fraction")

    # Two consecutive bad pairs is a strong off-by-one signal
    if extracted_count >= 2:
        for i in range(len(bad_flags) - 1):
            if bad_flags[i] and bad_flags[i + 1]:
                needs = True
                reasons.append("consecutive_bad")
                break

    return {
        "needs_realign": needs,
        "extracted": extracted_count,
        "bad": bad_count,
        "reasons": reasons,
    }


def apply_realign_map(
    segments: list[dict[str, Any]],
    id_to_target: dict[str, str],
) -> list[dict[str, Any]]:
    """
    Apply LLM realign map. Never changes source or id order.
    Empty / non-CJK targets become generated empty for translate fill.
    """
    out: list[dict[str, Any]] = []
    for seg in segments:
        sid = seg.get("id")
        if not isinstance(sid, str) or sid not in id_to_target:
            out.append(dict(seg))
            continue
        new_tgt = (id_to_target[sid] or "").strip()
        # Reject English-looking "targets" (must be CJK-ish Chinese)
        if new_tgt and cjk_ratio(new_tgt) < 0.15:
            new_tgt = ""

        updated = dict(seg)
        if new_tgt:
            updated["target"] = new_tgt
            if updated.get("origin") != "edited":
                updated["origin"] = "extracted"
        else:
            updated["target"] = ""
            if updated.get("origin") != "edited":
                updated["origin"] = "generated"
        out.append(updated)
    return out


async def realign_pairs(
    segments: list[dict[str, Any]],
    *,
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    """
    LLM reassign targets among existing ids.
    Fail-soft: on any batch error, keep segments as-is from that point.
    """
    if not segments:
        return segments
    if not settings.llm_api_key:
        return segments

    # Only realign when there is something to reassign
    if not any((s.get("target") or "").strip() for s in segments):
        return segments

    batch_size = max(5, settings.bilingual_realign_batch_size)
    overlap = 2
    step = max(1, batch_size - overlap)

    merged: dict[str, str] = {}
    total = len(segments)
    if on_progress:
        on_progress({"stage": "realign", "page": 0, "total": total})

    for start in range(0, total, step):
        batch = segments[start : start + batch_size]
        if not batch:
            break
        try:
            pairs = await _realign_batch(batch)
        except RealignError:
            # fail-soft: stop applying further windows
            break
        for item in pairs:
            sid = item.get("id")
            if isinstance(sid, str):
                merged[sid] = item.get("target") or ""
        if on_progress:
            on_progress(
                {
                    "stage": "realign",
                    "page": min(total, start + len(batch)),
                    "total": total,
                }
            )
        # Last window covered the tail
        if start + batch_size >= total:
            break

    if not merged:
        return segments
    return apply_realign_map(segments, merged)


async def _realign_batch(batch: list[dict[str, Any]]) -> list[dict[str, str]]:
    items = [
        {
            "id": s["id"],
            "source": s.get("source") or "",
            "target": s.get("target") or "",
        }
        for s in batch
        if s.get("id")
    ]
    user = (
        "Realign Chinese targets to the correct English sources. Return JSON only.\n"
        + json.dumps({"items": items}, ensure_ascii=False)
    )
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.llm_model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise RealignError("realign_http", str(exc)) from exc

    if resp.status_code >= 400:
        raise RealignError(
            "realign_api_error",
            f"status {resp.status_code}: {resp.text[:300]}",
        )

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise RealignError("realign_bad_response", str(exc)) from exc

    return _parse_pairs(content)


def _parse_pairs(content: str) -> list[dict[str, str]]:
    text = (content or "").strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise RealignError("realign_bad_json", "no JSON object in response")
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            raise RealignError("realign_bad_json", str(exc)) from exc

    items = data.get("pairs") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise RealignError("realign_bad_json", "missing pairs array")

    out: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        sid = item.get("id")
        target = item.get("target")
        if isinstance(sid, str) and isinstance(target, str):
            out.append({"id": sid, "target": target})
        elif isinstance(sid, str) and target is None:
            out.append({"id": sid, "target": ""})
    return out
