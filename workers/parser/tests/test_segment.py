from __future__ import annotations

from app.segments.segment import (
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
