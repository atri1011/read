from __future__ import annotations

from typing import Any, Literal

from app.segments.segment import (
    cjk_ratio,
    is_heading,
    is_translation_heading,
    sentences_for_block,
    split_blocks,
)

Origin = Literal["extracted", "generated", "edited"]


def _empty_segment(source: str, target: str = "", origin: Origin = "generated") -> dict[str, Any]:
    return {"source": source, "target": target, "origin": origin}


def align_markdown(markdown: str) -> list[dict[str, Any]]:
    """
    Produce unpaired segment dicts (no ids yet) from markdown.
    Prefer extracted ZH when layout heuristics match; otherwise empty targets.
    """
    blocks = split_blocks(markdown)
    if not blocks:
        return []

    # Strategy 1: explicit Translation section
    for i, block in enumerate(blocks):
        if is_translation_heading(block):
            en_blocks = blocks[:i]
            zh_blocks = blocks[i + 1 :]
            return _pair_streams(en_blocks, zh_blocks)

    # Strategy 2: walk and pair adjacent EN then ZH (or collect streams)
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
            # Orphan ZH: attach to previous empty target if possible, else drop as source
            for s in zh_stream:
                if paired and not paired[-1]["target"]:
                    paired[-1]["target"] = s
                    paired[-1]["origin"] = "extracted"
                else:
                    paired.append(_empty_segment(s, "", "extracted"))
            zh_stream = []

    for block in blocks:
        if is_translation_heading(block):
            continue
        if is_heading(block) and cjk_ratio(block) <= 0.3:
            flush_adjacent()
            paired.append(_empty_segment(block, "", "generated"))
            mode = None
            continue

        is_zh = cjk_ratio(block) > 0.3
        sents = sentences_for_block(block)
        if is_zh:
            if mode == "en" and en_stream:
                # closing EN run with this ZH block — keep collecting ZH until EN returns
                zh_stream.extend(sents)
                mode = "zh"
            elif mode == "zh" or mode is None:
                zh_stream.extend(sents)
                mode = "zh"
            else:
                zh_stream.extend(sents)
                mode = "zh"
        else:
            if mode == "zh" and (en_stream or zh_stream):
                flush_adjacent()
            en_stream.extend(sents)
            mode = "en"

    flush_adjacent()

    # If everything was pure EN, we already flushed as empty targets
    if not paired:
        for block in blocks:
            for s in sentences_for_block(block):
                paired.append(_empty_segment(s, "", "generated"))

    return _with_ids(paired)


def _pair_streams(en_blocks: list[str], zh_blocks: list[str]) -> list[dict[str, Any]]:
    en_sents: list[str] = []
    zh_sents: list[str] = []
    for b in en_blocks:
        if is_translation_heading(b):
            continue
        en_sents.extend(sentences_for_block(b))
    for b in zh_blocks:
        if is_translation_heading(b):
            continue
        zh_sents.extend(sentences_for_block(b))
    return _with_ids(_zip_sentence_lists(en_sents, zh_sents))


def _zip_sentence_lists(en: list[str], zh: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    n = max(len(en), len(zh))
    # Prefer 1:1 when counts close; otherwise sequential fill
    if en and zh and abs(len(en) - len(zh)) <= max(1, len(en) // 5):
        for i in range(n):
            src = en[i] if i < len(en) else ""
            tgt = zh[i] if i < len(zh) else ""
            if not src and tgt:
                # leftover ZH
                if out and not out[-1]["target"]:
                    out[-1]["target"] = tgt
                    out[-1]["origin"] = "extracted"
                continue
            if not src:
                continue
            origin: Origin = "extracted" if tgt else "generated"
            out.append(_empty_segment(src, tgt, origin))
        return out

    # Sequential: consume ZH for each EN
    zi = 0
    for src in en:
        tgt = zh[zi] if zi < len(zh) else ""
        if tgt:
            zi += 1
        origin = "extracted" if tgt else "generated"
        out.append(_empty_segment(src, tgt, origin))
    return out


def _with_ids(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for i, seg in enumerate(segments):
        source = (seg.get("source") or "").strip()
        if not source:
            continue
        result.append(
            {
                "id": f"s-{len(result)}",
                "source": source,
                "target": (seg.get("target") or "").strip(),
                "origin": seg.get("origin") or "generated",
            }
        )
    return result
