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

_PAGE_NUM = re.compile(
    r"^(?:page\s*)?\d{1,4}$"
    r"|^[—\-–]\s*\d{1,4}\s*[—\-–]$"
    r"|^第\s*\d+\s*页$",
    re.IGNORECASE,
)
_URL_ONLY = re.compile(r"^https?://\S+$", re.IGNORECASE)
_IMAGE_ONLY = re.compile(r"^!\[[^\]]*\]\([^)]*\)$")
_HR_ONLY = re.compile(r"^(?:---|\*\*\*|___)$")

_SOURCE_HEADINGS = frozenset(
    {"source", "原文", "english", "article", "正文", "english source"}
)
_TRANSLATION_HEADINGS = frozenset(
    {
        "translation",
        "译文",
        "中文译文",
        "chinese translation",
        "中文",
        "zh",
        "chinese",
    }
)

# Longer labels first so "chinese translation" wins over "chinese".
_SECTION_LABEL_RE = (
    r"english source|chinese translation|中文译文|translation|译文|"
    r"source|原文|article|正文|english|chinese|中文|zh"
)
# ## Source rest...  OR  ## Translation：正文  (inline heading + body)
_INLINE_SECTION = re.compile(
    rf"^(#{{1,6}})\s*({_SECTION_LABEL_RE})\b[ \t]*[:：]?[ \t]*(.*)$",
    re.IGNORECASE | re.DOTALL,
)
# Strip accidental section labels left inside a source/target string.
_LEADING_SECTION_LABEL = re.compile(
    rf"^(?:#{{1,6}}\s*)?(?:{_SECTION_LABEL_RE})\b[ \t]*[:：]?[ \t]*",
    re.IGNORECASE,
)


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


def _heading_plain(block: str) -> str:
    return re.sub(r"^#{1,6}\s*", "", block).strip().lower()


def is_translation_heading(block: str) -> bool:
    return _heading_plain(block) in _TRANSLATION_HEADINGS


def is_source_heading(block: str) -> bool:
    return _heading_plain(block) in _SOURCE_HEADINGS


def _section_kind(label: str) -> str | None:
    plain = label.strip().lower()
    if plain in _SOURCE_HEADINGS:
        return "source"
    if plain in _TRANSLATION_HEADINGS:
        return "translation"
    return None


def expand_section_headings(blocks: list[str]) -> list[str]:
    """
    Split inline section headings into a heading block + body block.

    Vision models often emit:
      ## Source As a freshman...
      ## Translation 作为一名...
    instead of a heading-only line. Without expansion, heading detection fails
    and the label leaks into the English source.
    """
    out: list[str] = []
    for block in blocks:
        text = block.strip()
        if not text:
            continue
        m = _INLINE_SECTION.match(text)
        if not m:
            out.append(block)
            continue
        kind = _section_kind(m.group(2))
        trailing = (m.group(3) or "").strip()
        if kind is None:
            out.append(block)
            continue
        out.append("## Source" if kind == "source" else "## Translation")
        if trailing:
            out.append(trailing)
    return out


def strip_section_label_prefix(text: str) -> str:
    """Remove a leading Source/Translation label if it leaked into sentence text."""
    prev = None
    cur = (text or "").strip()
    # At most two passes (e.g. "## Source Source ...")
    for _ in range(2):
        if prev == cur:
            break
        prev = cur
        cur = _LEADING_SECTION_LABEL.sub("", cur).strip()
    return cur


def is_junk_block(block: str) -> bool:
    """True for chrome/noise that must not become bilingual sentences."""
    plain = re.sub(r"^#{1,6}\s*", "", block).strip()
    if not plain:
        return True
    if is_source_heading(block) or is_translation_heading(block):
        return False
    if _HR_ONLY.match(plain):
        return True
    if _PAGE_NUM.match(plain):
        return True
    if _URL_ONLY.match(plain):
        return True
    if _IMAGE_ONLY.match(plain):
        return True
    if len(plain) <= 2 and not re.search(r"[A-Za-z一-鿿]", plain):
        return True
    return False


def sanitize_markdown(markdown: str) -> str:
    """Expand section headings, then drop junk blocks before align."""
    blocks = expand_section_headings(split_blocks(markdown))
    blocks = [b for b in blocks if not is_junk_block(b)]
    return "\n\n".join(blocks)


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
