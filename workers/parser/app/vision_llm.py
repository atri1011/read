from __future__ import annotations

import base64
from pathlib import Path

import httpx

from app.settings import settings

SYSTEM = """You extract reading content from page images into clean Markdown.

Keep ONLY:
1. The main article body (English or other source language)
2. Any accompanying translation (e.g. Chinese 译文), if present on the page

Discard everything else, including but not limited to:
- Headers, footers, running titles, page numbers
- Navigation, menus, breadcrumbs, sidebars, ads, QR codes
- Watermarks, copyright/legal boilerplate, publisher chrome
- UI chrome, buttons, icons, social share bars
- Captions/notes that are not part of the article or its translation
- Decorative text unrelated to the reading content

Rules:
- Preserve the wording of article and translation faithfully; do not summarize or invent text.
- Use #/## headings, lists, blockquotes, code fences only when they belong to the article/translation.
- If both article and translation appear, keep reading order; separate them clearly (e.g. a blank line or a short `## Translation` heading only when a translation block is present).
- For figures that are part of the article, emit a short Markdown image placeholder with a descriptive caption; skip pure decoration.
- If the page has no article/translation content, output an empty response (or a single empty line).
- Output Markdown only — no commentary, no explanations, no JSON wrappers, no code fences around the whole page."""


class VisionLLMError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _mime_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "image/png"


async def page_to_markdown(
    image_path: Path,
    page_index: int,
    page_total: int,
) -> str:
    if not settings.llm_api_key:
        raise VisionLLMError("llm_not_configured", "LLM_API_KEY is not set")

    b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    mime = _mime_for(image_path)
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Page {page_index}/{page_total}. "
                            "Extract only the article and any translation into Markdown. "
                            "Ignore headers, footers, page numbers, ads, and other non-content."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            },
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise VisionLLMError(
            "llm_timeout",
            f"vision request timed out after {settings.llm_timeout_seconds}s",
        ) from exc
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "")[:500]
        raise VisionLLMError(
            "llm_http_error",
            f"vision API HTTP {exc.response.status_code}: {body}",
        ) from exc
    except httpx.HTTPError as exc:
        raise VisionLLMError("llm_request_failed", str(exc)) from exc
    except ValueError as exc:
        raise VisionLLMError("llm_invalid_json", "vision API returned invalid JSON") from exc

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise VisionLLMError(
            "llm_bad_response",
            "vision API response missing choices[0].message.content",
        ) from exc

    if content is None:
        raise VisionLLMError("llm_empty_content", "vision API returned empty content")

    if isinstance(content, list):
        # Some providers return multimodal content parts
        texts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") in (None, "text")
        ]
        text = "\n".join(t for t in texts if t).strip()
    else:
        text = str(content).strip()

    # Empty is valid when the page has no article/translation (cover, blank, chrome-only).
    return text
