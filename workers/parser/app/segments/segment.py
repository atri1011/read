from __future__ import annotations

import re

# Common abbreviations that should not force a sentence break.
_ABBREV = re.compile(
    r"\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K|No)\.$",
    re.IGNORECASE,
)

_EN_SENT_END = re.compile(r"([.!?]+)(?:\s+|$)")
_ZH_SENT_END = re.compile(r"([。！？]+)(?:\s*|$)")
_CJK = re.compile(r"[一-鿿]")


def strip_page_separators(markdown: str) -> str:
    return re.sub(r"\n\s*---\s*\n", "\n\n", markdown)


def split_blocks(markdown: str) -> list[str]:
    text = strip_page_separators(markdown).strip()
    if not text:
        return []
    # Drop pure horizontal rules left over
    blocks = [b.strip() for b in re.split(r"\n{2,}", text) if b.strip()]
    return [b for b in blocks if b != "---"]


def cjk_ratio(text: str) -> float:
    if not text:
        return 0.0
    cjk = len(_CJK.findall(text))
    return cjk / max(len(text), 1)


def is_heading(block: str) -> bool:
    return bool(re.match(r"^#{1,6}\s+\S", block))


def is_translation_heading(block: str) -> bool:
    plain = re.sub(r"^#{1,6}\s*", "", block).strip().lower()
    return plain in {"translation", "译文", "中文译文", "chinese translation"}


def split_english_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    # Short blocks stay whole
    if len(text) < 12 or text.count(".") + text.count("?") + text.count("!") <= 1:
        # Still split if clearly multi-sentence and long enough
        if not re.search(r"[.!?]+\s+\S", text):
            return [text]

    sentences: list[str] = []
    buf: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        buf.append(ch)
        if ch in ".!?":
            candidate = "".join(buf).strip()
            # look ahead whitespace + capital / end
            rest = text[i + 1 :]
            if rest and not rest[0].isspace() and rest[0] not in "\"')]}":
                i += 1
                continue
            # protect abbreviations
            if _ABBREV.search(candidate):
                i += 1
                continue
            # consume trailing quotes
            j = i + 1
            while j < len(text) and text[j] in "\"')]}":
                buf.append(text[j])
                j += 1
            sentences.append("".join(buf).strip())
            buf = []
            i = j
            while i < len(text) and text[i].isspace():
                i += 1
            continue
        i += 1
    tail = "".join(buf).strip()
    if tail:
        sentences.append(tail)
    return [s for s in sentences if s]


def split_chinese_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if not re.search(r"[。！？]", text):
        return [text]
    parts: list[str] = []
    buf: list[str] = []
    for ch in text:
        buf.append(ch)
        if ch in "。！？":
            parts.append("".join(buf).strip())
            buf = []
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return [p for p in parts if p]


def sentences_for_block(block: str) -> list[str]:
    if is_heading(block):
        return [block]
    if cjk_ratio(block) > 0.3:
        return split_chinese_sentences(block)
    return split_english_sentences(block)
