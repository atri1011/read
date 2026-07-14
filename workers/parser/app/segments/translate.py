from __future__ import annotations

import json
import re
from typing import Any, Callable

import httpx

from app.settings import settings

BATCH_SIZE = 20

ProgressCb = Callable[[dict[str, Any]], None]

SYSTEM = """You translate English reading sentences into Chinese for language learners.
Rules:
- Faithful EN→ZH translation; do not summarize or invent content.
- Preserve proper nouns when appropriate.
- Output JSON only: {"translations":[{"id":"s-0","target":"..."}, ...]}
- One target per id; no commentary."""


class TranslateError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


async def fill_missing_targets(
    segments: list[dict[str, Any]],
    *,
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    missing = [s for s in segments if not (s.get("target") or "").strip()]
    if not missing:
        return segments

    if not settings.llm_api_key:
        # Leave empty; review can still proceed
        return segments

    total_missing = len(missing)
    if on_progress:
        on_progress({"stage": "translate", "page": 0, "total": total_missing})

    by_id = {s["id"]: s for s in segments}
    done = 0
    for start in range(0, total_missing, BATCH_SIZE):
        batch = missing[start : start + BATCH_SIZE]
        try:
            translated = await _translate_batch(batch)
        except TranslateError:
            # fail-soft: keep remaining empty
            break
        for item in translated:
            sid = item.get("id")
            target = (item.get("target") or "").strip()
            if not sid or sid not in by_id or not target:
                continue
            by_id[sid]["target"] = target
            if by_id[sid].get("origin") != "edited":
                by_id[sid]["origin"] = "generated"
        done = min(total_missing, start + len(batch))
        if on_progress:
            on_progress({"stage": "translate", "page": done, "total": total_missing})

    return [by_id[s["id"]] for s in segments]


async def _translate_batch(batch: list[dict[str, Any]]) -> list[dict[str, str]]:
    payload_lines = [{"id": s["id"], "source": s["source"]} for s in batch]
    user = (
        "Translate each English source to Chinese. Return JSON only.\n"
        + json.dumps({"items": payload_lines}, ensure_ascii=False)
    )
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.llm_model,
        "temperature": 0.2,
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
        raise TranslateError("translate_http", str(exc)) from exc

    if resp.status_code >= 400:
        raise TranslateError(
            "translate_api_error",
            f"status {resp.status_code}: {resp.text[:300]}",
        )

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise TranslateError("translate_bad_response", str(exc)) from exc

    return _parse_translations(content)


def _parse_translations(content: str) -> list[dict[str, str]]:
    text = content.strip()
    # Strip optional fences
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # try to find first JSON object
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise TranslateError("translate_bad_json", "no JSON object in response")
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            raise TranslateError("translate_bad_json", str(exc)) from exc

    items = data.get("translations") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise TranslateError("translate_bad_json", "missing translations array")

    out: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        sid = item.get("id")
        target = item.get("target")
        if isinstance(sid, str) and isinstance(target, str):
            out.append({"id": sid, "target": target})
    return out
