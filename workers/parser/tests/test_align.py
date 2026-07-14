from __future__ import annotations

from app.segments.align import align_markdown


def test_en_only() -> None:
    md = "The cat sat on the mat. It looked content.\n\nAnother paragraph here."
    segs = align_markdown(md)
    assert len(segs) >= 2
    assert all(s["id"].startswith("s-") for s in segs)
    assert all(s["source"] for s in segs)
    # no ZH in source → empty targets until translate
    assert all(s["origin"] in {"generated", "extracted"} for s in segs)


def test_translation_heading() -> None:
    md = (
        "The cat sat on the mat.\n\n"
        "It looked content.\n\n"
        "## Translation\n\n"
        "猫蹲在垫子上。\n\n"
        "它看起来很满足。"
    )
    segs = align_markdown(md)
    assert len(segs) >= 2
    assert segs[0]["source"].startswith("The cat")
    assert segs[0]["target"]
    assert segs[0]["origin"] == "extracted"


def test_alternating_paragraphs() -> None:
    md = (
        "Hello world.\n\n"
        "你好，世界。\n\n"
        "Second sentence here.\n\n"
        "第二句在这里。"
    )
    segs = align_markdown(md)
    assert len(segs) >= 2
    extracted = [s for s in segs if s["origin"] == "extracted"]
    assert len(extracted) >= 1
    assert any(s["target"] for s in segs)
