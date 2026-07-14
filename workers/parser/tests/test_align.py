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
    assert segs[0]["source"].startswith("Hello")
    assert "你好" in segs[0]["target"]
    assert segs[1]["source"].startswith("Second")
    assert "第二句" in segs[1]["target"]


def test_zh_title_then_en_half_zh_half() -> None:
    """Bilingual PDF pattern: CJK title, English body, repeated CJK title, Chinese body."""
    md = """# 短视频快乐背后的代价

In today's digital world, short videos have become an essential part of daily life, especially for teenagers.

But why are they so attractive?

And what are the risks of overuse?

These videos are designed to grab attention quickly.

# 短视频快乐背后的代价

在如今的数字时代，短视频已成为日常生活中重要的组成部分，尤其对青少年而言。

但为何它们如此具有吸引力？

过度使用又会带来哪些风险呢？

这些短视频的设计初衷就是快速抓住注意力。
"""
    segs = align_markdown(md)
    assert len(segs) == 4
    # Title must not become an English source or shift targets
    assert not any("短视频" in s["source"] for s in segs)
    assert segs[0]["source"].startswith("In today's digital world")
    assert "数字时代" in segs[0]["target"]
    assert segs[1]["source"].startswith("But why")
    assert "吸引" in segs[1]["target"]
    assert segs[2]["source"].startswith("And what")
    assert "风险" in segs[2]["target"]
    assert segs[3]["source"].startswith("These videos")
    assert "注意力" in segs[3]["target"]
    # No target should be a markdown heading title leftover
    assert not any(s["target"].lstrip().startswith("#") for s in segs)


def test_leading_zh_title_alternating() -> None:
    md = (
        "# 中文标题\n\n"
        "Hello world.\n\n"
        "你好，世界。\n\n"
        "Second sentence here.\n\n"
        "第二句在这里。"
    )
    segs = align_markdown(md)
    assert len(segs) == 2
    assert segs[0]["source"].startswith("Hello")
    assert "你好" in segs[0]["target"]
    assert segs[1]["source"].startswith("Second")
    assert "第二句" in segs[1]["target"]
    assert not any("中文标题" in s["source"] for s in segs)


def test_no_cjk_as_source() -> None:
    md = "# 只有中文标题\n\n只有中文段落，没有英文。"
    segs = align_markdown(md)
    assert segs == []


def test_source_and_translation_sections() -> None:
    md = (
        "## Source\n\n"
        "The cat sat on the mat.\n\n"
        "It looked content.\n\n"
        "## Translation\n\n"
        "猫蹲在垫子上。\n\n"
        "它看起来很满足。"
    )
    segs = align_markdown(md)
    assert len(segs) == 2
    assert segs[0]["source"].startswith("The cat")
    assert "猫" in segs[0]["target"]
    assert segs[1]["source"].startswith("It looked")
    assert "满足" in segs[1]["target"]
    assert segs[0]["origin"] == "extracted"
    assert not any("Source" in s["source"] for s in segs)


def test_length_zip_skips_extra_zh_midstream() -> None:
    """Extra short ZH title mid-stream should not shift later pairs."""
    md = (
        "## Source\n\n"
        "In today's digital world short videos are popular among teenagers everywhere.\n\n"
        "But why are they so attractive to young people nowadays?\n\n"
        "These videos are designed to grab attention quickly and hold it.\n\n"
        "## Translation\n\n"
        "短视频\n\n"
        "在如今的数字时代，短视频在青少年中非常流行。\n\n"
        "但为何它们对年轻人如此具有吸引力呢？\n\n"
        "这些短视频的设计初衷就是快速抓住注意力并保持。"
    )
    segs = align_markdown(md)
    assert len(segs) == 3
    assert segs[0]["source"].startswith("In today's")
    assert "数字时代" in segs[0]["target"] or "流行" in segs[0]["target"]
    assert segs[1]["source"].startswith("But why")
    assert "吸引" in segs[1]["target"]
    assert segs[2]["source"].startswith("These videos")
    assert "注意力" in segs[2]["target"]
    # The orphan title must not become a target of the first long sentence alone
    assert segs[0]["target"].strip() != "短视频"


def test_junk_blocks_do_not_become_sources() -> None:
    md = (
        "Hello world this is a real sentence.\n\n"
        "12\n\n"
        "Page 3\n\n"
        "你好，这是真实的一句译文。\n\n"
        "Second English sentence is here now.\n\n"
        "第二句英文对应的中文译文。"
    )
    segs = align_markdown(md)
    assert all("Page" not in s["source"] for s in segs)
    assert all(s["source"] not in {"12", "Page 3"} for s in segs)
    assert any(s["source"].startswith("Hello") for s in segs)
    assert any("你好" in s["target"] for s in segs if s["target"])
