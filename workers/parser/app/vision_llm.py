from __future__ import annotations

import base64
from pathlib import Path

import httpx

from app.settings import settings

SYSTEM = """You restore English reading material from page images into clean Markdown.
Preserve wording. Use #/## headings, lists, blockquotes, code fences when appropriate.
For figures, emit a short Markdown image placeholder with a descriptive caption.
Output Markdown only."""


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
                            "Convert this page to Markdown."
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

    if not text:
        raise VisionLLMError("llm_empty_content", "vision API returned empty markdown")

    return text
