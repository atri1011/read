from __future__ import annotations

import base64
from pathlib import Path

import httpx

from app.settings import settings

SYSTEM = """You extract bilingual reading content from page images into clean Markdown.

OUTPUT ONLY these two content kinds (when present):
1. Source article text (usually English)
2. Chinese translation of that article (译文), if visible on the page

STRUCTURE (required when BOTH source and translation appear on the page):
## Source
<source paragraphs only>

## Translation
<Chinese translation paragraphs only>

Rules:
- Under ## Source put ONLY the source-language article body (and its genuine headings).
- Under ## Translation put ONLY the Chinese translation of that article.
- If the page has source only: output the source body under ## Source (or bare paragraphs). Do NOT invent a translation.
- If the page has translation only with no source: output empty (skip page).
- Preserve wording faithfully; do not summarize, paraphrase, or invent missing sentences.
- Keep paragraph breaks. Prefer one sentence per line when the page is sentence-aligned bilingual.
- Reading order: complete Source block first, then complete Translation block (do NOT interleave EN/ZH lines).
- Use #/## headings inside sections only when they belong to the article/translation itself.

DISCARD completely (never output):
- Headers, footers, running titles, page numbers, "Page N"
- Navigation, menus, breadcrumbs, sidebars, ads, QR codes
- Watermarks, copyright lines, publisher chrome, URLs that are not part of the article
- UI chrome, buttons, icons, social share bars
- Captions/notes that are not part of the article or its translation
- Decorative text, exam metadata, answer keys unrelated to the reading passage
- Markdown image placeholders for pure decoration (skip figures unless essential to the article text)

Output Markdown only — no commentary, no JSON wrappers, no outer code fences.
If the page has no article/translation content, output a single empty line."""


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
                            "Extract ONLY the reading article and its Chinese translation (if any). "
                            "Use ## Source and ## Translation headings when both are present. "
                            "Ignore headers, footers, page numbers, ads, and all non-article chrome."
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
