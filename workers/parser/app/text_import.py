from __future__ import annotations

from pathlib import Path


def load_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def to_markdown(text: str, filename: str) -> str:
    name = filename.lower()
    body = text.replace("\r\n", "\n").replace("\r", "\n").strip() + "\n"
    if name.endswith(".md"):
        return body
    # plain txt: keep paragraphs as-is for review
    return body
