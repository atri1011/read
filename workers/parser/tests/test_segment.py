from __future__ import annotations

from app.segments.segment import (
    is_source_heading,
    is_translation_heading,
    sanitize_markdown,
    split_blocks,
    split_english_sentences,
    strip_page_separators,
)


def test_strip_page_separators() -> None:
    md = "Hello.\n\n---\n\nWorld."
    assert "---" not in strip_page_separators(md)


def test_split_blocks() -> None:
    blocks = split_blocks("Para one.\n\nPara two.\n\n---\n\nPara three.")
    assert blocks == ["Para one.", "Para two.", "Para three."]


def test_split_english_sentences_basic() -> None:
    sents = split_english_sentences("Hello world. How are you? Fine!")
    assert len(sents) == 3
    assert sents[0].startswith("Hello")


def test_split_english_abbreviation() -> None:
    sents = split_english_sentences("Mr. Smith went home. He slept.")
    assert len(sents) == 2
    assert "Mr. Smith" in sents[0]


def test_is_source_heading() -> None:
    assert is_source_heading("## Source")
    assert is_source_heading("# 原文")
    assert is_source_heading("## English")
    assert not is_source_heading("## Introduction")


def test_is_translation_heading_aliases() -> None:
    assert is_translation_heading("## Translation")
    assert is_translation_heading("## 译文")
    assert is_translation_heading("## 中文")
    assert is_translation_heading("zh")


def test_sanitize_drops_page_numbers() -> None:
    md = "Hello world.\n\n12\n\nPage 3\n\n第 4 页\n\nNext sentence."
    cleaned = sanitize_markdown(md)
    assert "Hello world." in cleaned
    assert "Next sentence." in cleaned
    assert "12" not in cleaned.split()
    assert "Page 3" not in cleaned
    assert "第 4 页" not in cleaned


def test_sanitize_drops_url_only() -> None:
    md = "Hello world.\n\nhttps://example.com/foo\n\nMore text."
    cleaned = sanitize_markdown(md)
    assert "https://example.com/foo" not in cleaned
    assert "Hello world." in cleaned
    assert "More text." in cleaned


def test_sanitize_keeps_source_translation_headings() -> None:
    md = (
        "## Source\n\n"
        "Hello world.\n\n"
        "https://noise.example\n\n"
        "## Translation\n\n"
        "你好，世界。"
    )
    cleaned = sanitize_markdown(md)
    assert "## Source" in cleaned
    assert "## Translation" in cleaned
    assert "Hello world." in cleaned
    assert "你好，世界。" in cleaned
    assert "https://noise.example" not in cleaned


def test_split_english_curly_quotes_boundary() -> None:
    text = "“Never give up. Stick to the plan,” she said. Next sentence starts here."
    sents = split_english_sentences(text)
    assert any("Stick to the plan" in s for s in sents)
    assert any(s.startswith("Next sentence") for s in sents)
    assert not any("she said" in s and "Next sentence" in s for s in sents)


def test_split_chinese_respects_quotes() -> None:
    from app.segments.segment import split_chinese_sentences

    text = "“第一句。第二句，”她说。“第三句。”然后旁白。"
    sents = split_chinese_sentences(text)
    assert not any(s.startswith("”") for s in sents)
    assert any("然后旁白" in s for s in sents)


def test_expand_inline_source_translation_headings() -> None:
    """Vision often puts heading label and body on the same line."""
    md = (
        "## Source As a freshman I faced problems.\n\n"
        "## Translation 作为一名新生我遇到了问题。"
    )
    cleaned = sanitize_markdown(md)
    assert "## Source" in cleaned
    assert "## Translation" in cleaned
    assert "As a freshman I faced problems." in cleaned
    assert "作为一名新生我遇到了问题。" in cleaned
    # Label must not remain glued to the body
    assert "Source As" not in cleaned
    assert "Translation 作为" not in cleaned
