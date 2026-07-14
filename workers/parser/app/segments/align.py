from __future__ import annotations

import math
from typing import Any, Literal

from app.segments.segment import (
    cjk_ratio,
    is_heading,
    is_junk_block,
    is_source_heading,
    is_translation_heading,
    sanitize_markdown,
    sentences_for_block,
    split_blocks,
    strip_section_label_prefix,
)

Origin = Literal["extracted", "generated", "edited"]


def _empty_segment(source: str, target: str = "", origin: Origin = "generated") -> dict[str, Any]:
    return {"source": source, "target": target, "origin": origin}


def _is_zh_text(text: str) -> bool:
    return cjk_ratio(text) > 0.3


def align_markdown(markdown: str) -> list[dict[str, Any]]:
    """
    Produce unpaired segment dicts (no ids yet) from markdown.
    Prefer extracted ZH when layout heuristics match; otherwise empty targets.
    """
    # Accept either raw or pre-sanitized markdown.
    blocks = [b for b in split_blocks(sanitize_markdown(markdown)) if not is_junk_block(b)]
    if not blocks:
        return []

    # Strategy 0: explicit ## Source ... ## Translation sections
    # Only when the Translation half is pure ZH. Mixed trailing EN/ZH
    # (common when vision labels only the first paragraph) must fall through
    # to alternating pairing — otherwise later English is swallowed as "ZH".
    sectioned = _pair_source_translation_sections(blocks)
    if sectioned is not None:
        return sectioned

    # Strategy 1: explicit Translation section with pure-ZH right half
    for i, block in enumerate(blocks):
        if is_translation_heading(block):
            zh_blocks = blocks[i + 1 :]
            if _is_pure_zh_half(zh_blocks):
                en_blocks = [b for b in blocks[:i] if not is_source_heading(b)]
                return _pair_streams(en_blocks, zh_blocks)
            # Mixed content after Translation → ignore heading, use later strategies
            break

    # Strategy 2: full-document EN half then ZH half (common bilingual PDF extract)
    split_at = _find_en_zh_split(blocks)
    if split_at is not None:
        return _pair_streams(blocks[:split_at], blocks[split_at:])

    # Strategy 3: walk and pair adjacent EN then ZH runs
    en_stream: list[str] = []
    zh_stream: list[str] = []
    paired: list[dict[str, Any]] = []
    mode: str | None = None  # "en" | "zh" for run-length grouping

    def flush_adjacent() -> None:
        nonlocal en_stream, zh_stream
        if en_stream and zh_stream:
            paired.extend(_zip_sentence_lists(en_stream, zh_stream))
            en_stream = []
            zh_stream = []
        elif en_stream:
            for s in en_stream:
                paired.append(_empty_segment(s, "", "generated"))
            en_stream = []
        elif zh_stream:
            # Orphan ZH: attach to previous empty target when possible.
            # Never promote pure CJK (esp. titles) to English source — that
            # creates ghost pairs and shifts subsequent alignment.
            for s in zh_stream:
                if paired and not paired[-1]["target"]:
                    paired[-1]["target"] = s
                    paired[-1]["origin"] = "extracted"
                # else: drop orphan ZH heading/title or stray line
            zh_stream = []

    for block in blocks:
        if is_translation_heading(block) or is_source_heading(block):
            continue
        # English (or non-CJK) headings start a new structural unit
        if is_heading(block) and not _is_zh_text(block):
            flush_adjacent()
            paired.append(_empty_segment(block, "", "generated"))
            mode = None
            continue

        is_zh = _is_zh_text(block)
        sents = [
            strip_section_label_prefix(s)
            for s in sentences_for_block(block)
        ]
        sents = [s for s in sents if s]
        if is_zh:
            sents = [s for s in sents if _is_zh_text(s)]
            if not sents:
                continue
            if mode == "en" and en_stream:
                # closing EN run with this ZH block — keep collecting ZH until EN returns
                zh_stream.extend(sents)
                mode = "zh"
            else:
                zh_stream.extend(sents)
                mode = "zh"
        else:
            sents = [s for s in sents if not _is_zh_text(s)]
            if not sents:
                continue
            if mode == "zh" and (en_stream or zh_stream):
                flush_adjacent()
            en_stream.extend(sents)
            mode = "en"

    flush_adjacent()

    # If everything was pure EN, we already flushed as empty targets
    if not paired:
        for block in blocks:
            if _is_zh_text(block) or is_source_heading(block) or is_translation_heading(block):
                continue
            for s in sentences_for_block(block):
                paired.append(_empty_segment(s, "", "generated"))

    return _with_ids(paired)


def _is_pure_zh_half(blocks: list[str]) -> bool:
    """True when every content block is Chinese (section titles allowed)."""
    content = [
        b
        for b in blocks
        if not is_source_heading(b)
        and not is_translation_heading(b)
        and not is_junk_block(b)
    ]
    if not content:
        return False
    return all(_is_zh_text(b) for b in content)


def _pair_source_translation_sections(blocks: list[str]) -> list[dict[str, Any]] | None:
    """
    Prefer structured vision output:
      ## Source
      ...
      ## Translation
      ...
    Returns paired segments, or None if structure not present / not pure ZH half.
    """
    source_idx: int | None = None
    translation_idx: int | None = None
    for i, block in enumerate(blocks):
        if is_source_heading(block) and source_idx is None:
            source_idx = i
        elif is_translation_heading(block) and translation_idx is None:
            translation_idx = i

    if translation_idx is None:
        return None

    if source_idx is not None and source_idx < translation_idx:
        en_blocks = blocks[source_idx + 1 : translation_idx]
        zh_blocks = blocks[translation_idx + 1 :]
        if not _is_pure_zh_half(zh_blocks):
            return None
        return _pair_streams(en_blocks, zh_blocks)

    # Translation heading only (legacy free-form with ## Translation)
    en_blocks = [b for b in blocks[:translation_idx] if not is_source_heading(b)]
    zh_blocks = blocks[translation_idx + 1 :]
    if not _is_pure_zh_half(zh_blocks):
        return None
    return _pair_streams(en_blocks, zh_blocks)


def _find_en_zh_split(blocks: list[str]) -> int | None:
    """
    Detect bipartite layout: English body followed by Chinese body.
    Leading CJK title headings are allowed above the EN half.
    Returns index where the ZH half starts, or None.

    Requires pure-EN left body and pure-ZH right so alternating
    EN/ZH paragraphs are not misclassified as two halves.
    """
    if len(blocks) < 2:
        return None

    flags = [_is_zh_text(b) for b in blocks]

    # Optional leading ZH titles (document title above English half)
    start = 0
    while start < len(blocks) and flags[start] and _looks_like_title_line(
        blocks[start]
    ):
        start += 1

    best: int | None = None
    best_score = 0

    for i in range(max(start + 1, 1), len(blocks)):
        left_flags = flags[start:i]
        right_flags = flags[i:]
        if not left_flags or not right_flags:
            continue
        # Left body must be pure EN; right half pure ZH
        if any(left_flags):
            continue
        if not all(right_flags):
            continue

        score = len(left_flags) + len(right_flags)
        if score > best_score:
            best_score = score
            best = i

    if best is not None and best_score >= 2:
        return best
    return None


def _pair_streams(en_blocks: list[str], zh_blocks: list[str]) -> list[dict[str, Any]]:
    en_sents: list[str] = []
    zh_sents: list[str] = []
    for b in en_blocks:
        if is_translation_heading(b) or is_source_heading(b) or is_junk_block(b):
            continue
        # Leading Chinese title often sits above the English half — not a source.
        if _is_zh_text(b):
            continue
        for s in sentences_for_block(b):
            cleaned = strip_section_label_prefix(s)
            if cleaned and not _is_zh_text(cleaned):
                en_sents.append(cleaned)
    for b in zh_blocks:
        if is_translation_heading(b) or is_source_heading(b) or is_junk_block(b):
            continue
        # Never treat English leftovers as Chinese targets
        if not _is_zh_text(b):
            continue
        for s in sentences_for_block(b):
            cleaned = strip_section_label_prefix(s)
            if cleaned and _is_zh_text(cleaned):
                zh_sents.append(cleaned)
    return _with_ids(_zip_sentence_lists(en_sents, zh_sents))


def _strip_extra_zh_headings(en: list[str], zh: list[str]) -> tuple[list[str], list[str]]:
    """
    Drop ZH section titles that have no EN heading counterpart.

    Common bilingual extracts repeat the document title only on the ZH side
    (or on both sides as CJK), which otherwise shifts every pair by one.
    """
    en = list(en)
    zh = list(zh)

    en_starts_with_heading = bool(en) and is_heading(en[0])

    while zh and is_heading(zh[0]) and not en_starts_with_heading:
        zh.pop(0)

    # If both start with headings, keep one pair; drop additional ZH-only titles
    if en_starts_with_heading and zh and is_heading(zh[0]):
        # pair first headings; strip further leading ZH headings beyond one
        i = 1
        while i < len(zh) and is_heading(zh[i]) and (
            i >= len(en) or not is_heading(en[i])
        ):
            i += 1
        if i > 1:
            zh = [zh[0], *zh[i:]]

    # Count mismatch of +1 with a short title-like first ZH line (no #)
    if (
        en
        and zh
        and len(zh) == len(en) + 1
        and not en_starts_with_heading
        and _looks_like_title_line(zh[0])
    ):
        zh = zh[1:]

    return en, zh


def _looks_like_title_line(text: str) -> bool:
    plain = text.strip()
    if is_heading(plain):
        return True
    # Short CJK-only line without sentence punctuation → likely a title
    if not _is_zh_text(plain):
        return False
    if len(plain) > 40:
        return False
    if any(p in plain for p in "。！？；;"):
        return False
    return True


def _effective_len(text: str) -> float:
    """
    Length proxy comparable across EN/ZH.
    CJK characters carry more semantic weight per char than Latin.
    """
    if not text:
        return 1.0
    cjk_n = 0
    other_n = 0
    for ch in text:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF:
            cjk_n += 1
        elif not ch.isspace():
            other_n += 1
    # Map both to ~"English letter" units
    return max(1.0, other_n + cjk_n * 1.8)


def _pair_cost(en: str, zh: str) -> float:
    """Lower is better. CJK-aware log-length distance; titles slightly penalized as matches."""
    el = _effective_len(en)
    zl = _effective_len(zh)
    cost = abs(math.log(zl) - math.log(el))
    if _looks_like_title_line(zh) and len(en) > 40:
        cost += 0.8
    return cost


# Gap costs for DP alignment (must exceed typical good-pair cost ~0.1–0.5)
_GAP_EN = 0.85  # leave English without Chinese
_GAP_ZH = 0.95  # skip a Chinese sentence
_GAP_ZH_TITLE = 0.25  # cheap to drop ZH-only titles


def _zip_by_dp(en: list[str], zh: list[str]) -> list[dict[str, Any]]:
    """
    Global sentence alignment (Needleman–Wunsch style).

    Prefer matching by CJK-aware length; allow gaps so one missing Chinese
    does not shift every later pair. Title-like ZH is cheap to skip.
    """
    n, m = len(en), len(zh)
    # dp[i][j] = best cost aligning en[:i] with zh[:j]
    inf = 1e9
    dp = [[inf] * (m + 1) for _ in range(n + 1)]
    bt: list[list[tuple[int, int, str]]] = [
        [(0, 0, "")] * (m + 1) for _ in range(n + 1)
    ]
    dp[0][0] = 0.0
    for i in range(1, n + 1):
        dp[i][0] = dp[i - 1][0] + _GAP_EN
        bt[i][0] = (i - 1, 0, "en")
    for j in range(1, m + 1):
        gap = _GAP_ZH_TITLE if _looks_like_title_line(zh[j - 1]) else _GAP_ZH
        dp[0][j] = dp[0][j - 1] + gap
        bt[0][j] = (0, j - 1, "zh")

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            match = dp[i - 1][j - 1] + _pair_cost(en[i - 1], zh[j - 1])
            skip_en = dp[i - 1][j] + _GAP_EN
            gap_zh = (
                _GAP_ZH_TITLE if _looks_like_title_line(zh[j - 1]) else _GAP_ZH
            )
            skip_zh = dp[i][j - 1] + gap_zh

            best = match
            prev = (i - 1, j - 1, "match")
            if skip_en < best:
                best = skip_en
                prev = (i - 1, j, "en")
            if skip_zh < best:
                best = skip_zh
                prev = (i, j - 1, "zh")
            dp[i][j] = best
            bt[i][j] = prev

    # Backtrack
    pairs_rev: list[tuple[str, str]] = []
    i, j = n, m
    while i > 0 or j > 0:
        pi, pj, op = bt[i][j]
        if op == "match":
            pairs_rev.append((en[i - 1], zh[j - 1]))
        elif op == "en":
            pairs_rev.append((en[i - 1], ""))
        elif op == "zh":
            # dropped ZH (title / orphan)
            pass
        else:
            break
        if pi == i and pj == j:
            break
        i, j = pi, pj

    pairs_rev.reverse()
    out: list[dict[str, Any]] = []
    for src, tgt in pairs_rev:
        origin: Origin = "extracted" if tgt else "generated"
        out.append(_empty_segment(src, tgt, origin))
    return out


def _zip_sentence_lists(en: list[str], zh: list[str]) -> list[dict[str, Any]]:
    en = [strip_section_label_prefix(s) for s in en]
    zh = [strip_section_label_prefix(s) for s in zh]
    en, zh = _strip_extra_zh_headings(en, zh)
    # Final guard: never keep CJK-only strings as English sources;
    # never keep non-CJK strings as Chinese targets.
    en = [s for s in en if s and not _is_zh_text(s)]
    zh = [s for s in zh if s and _is_zh_text(s)]

    if not en:
        return []
    if not zh:
        return [_empty_segment(s, "", "generated") for s in en]

    return _zip_by_dp(en, zh)


def _with_ids(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for seg in segments:
        source = strip_section_label_prefix((seg.get("source") or "").strip())
        if not source:
            continue
        # Bilingual pipeline is EN→ZH; skip accidental CJK sources
        if _is_zh_text(source):
            continue
        target = strip_section_label_prefix((seg.get("target") or "").strip())
        if target and not _is_zh_text(target):
            target = ""
        origin = seg.get("origin") or "generated"
        if not target and origin == "extracted":
            origin = "generated"
        result.append(
            {
                "id": f"s-{len(result)}",
                "source": source,
                "target": target,
                "origin": origin,
            }
        )
    return result
