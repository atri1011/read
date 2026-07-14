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


def test_inline_source_heading_not_in_source_text() -> None:
    md = (
        "## Source As a freshman in high school, I faced numerous problems while learning English.\n\n"
        "## Translation 作为一名高一新生，我在英语学习中遇到了很多问题。"
    )
    segs = align_markdown(md)
    assert len(segs) >= 1
    assert segs[0]["source"].startswith("As a freshman")
    assert "Source" not in segs[0]["source"]
    assert "作为一名" in segs[0]["target"]
    assert "Translation" not in segs[0]["target"]


def test_mixed_section_then_alternating_does_not_swallow_english() -> None:
    """## Source/Translation only on first para; rest is interleaved EN/ZH."""
    md = (
        "## Source\n\n"
        "As a freshman I faced problems.\n\n"
        "## Translation\n\n"
        "作为一名新生我遇到了问题。\n\n"
        "One day my teacher helped me.\n\n"
        "有一天老师帮助了我。\n\n"
        "She gave me advice.\n\n"
        "她给了我建议。"
    )
    segs = align_markdown(md)
    sources = [s["source"] for s in segs]
    assert any("freshman" in s for s in sources)
    assert any("One day" in s for s in sources)
    assert any("She gave" in s for s in sources)
    # English after Translation must remain sources, not disappear
    assert len(segs) >= 3
    # First pairs should keep Chinese targets
    by_src = {s["source"]: s["target"] for s in segs}
    assert any("新生" in (t or "") for t in by_src.values())
    assert any("老师" in (t or "") for t in by_src.values())


def test_unicode_quotes_do_not_merge_english_sentences() -> None:
    """Curly quotes after period must still allow a sentence boundary."""
    from app.segments.segment import split_english_sentences

    text = (
        "“Hold on: never give up. Stick to your plan,” she said. "
        "“Help others on your journey. Success is sweeter when shared.” "
        "She previously explained that “you do not need to look good.”"
    )
    sents = split_english_sentences(text)
    joined = " | ".join(sents)
    assert any("Hold on" in s for s in sents)
    assert any("Stick to your plan" in s for s in sents)
    assert any("She previously explained" in s for s in sents)
    # Must not glue the closing quote sentence onto the next narrator sentence only by smart quotes
    assert not any(
        "shared" in s and "She previously explained" in s for s in sents
    ), joined


def test_chinese_quotes_keep_dialogue_together() -> None:
    from app.segments.segment import split_chinese_sentences

    text = (
        "“要坚持：把失败当成成功的垫脚石，千万别放弃。按计划走，”她说道，"
        "“要助人：前行路上多帮衬他人。成功与人分享，才更有滋味。”"
        "她之前也说过：“健身不非得有副好身材……目标是让自己舒服，不是为了好看。”"
        "以前总有人嘲笑多诺霍年纪太大，不适合健身。"
    )
    sents = split_chinese_sentences(text)
    # Dialogue should not explode into many orphan fragments starting with ”
    assert not any(s.startswith("”") for s in sents), sents
    assert any("她之前也说过" in s for s in sents)
    assert any("以前总有人嘲笑" in s for s in sents)


def test_en_zh_half_donohue_alignment() -> None:
    """
    Full English body then Chinese body (common bilingual extract).
    Greedy length-zip used to skip correct short ZH and shift the rest.
    """
    md = """Evelyn Donohue is a 65-year-old grandma. She only started to exercise seven years ago after having a wake-up call. She’d been struggling with eating disorders and health issues, which ultimately led her to getting surgery. After that experience, she knew that she needed to make a change. Determined to turn her life around, Ms Donohue began to work out and follow a healthy lifestyle, before discovering a passion for weightlifting. Since setting out on the journey, the fitness lover has not only managed to grow an impressive set of muscles—but also a huge following on social media. The well-liked grandma regularly posts workout content, explaining there’s no reason others can’t look this good. She said it was all down to some key aspects. “Hold on: Consider failure as a stepping stone to success and never give up. Stick to your plan,” she said. “Help others: Lift others up on your journey. Success is sweeter when shared.” She previously explained that “you do not need to have an amazing body to exercise… the goal is to feel good, not look good.” Ms Donohue used to be laughed at for being too old to work out, but she has proved the doubters wrong in the best possible way and has indeed become an inspiration for many social media users.

伊芙琳·多诺霍是位 65 岁的奶奶。她七年前才开始锻炼，此前经历了一次警醒。此前，她一直受饮食失调和健康问题的困扰，最后不得不接受手术。经历过这一切，她明白自己必须做出改变。多诺霍决心彻底改变生活，于是开始锻炼、践行健康的生活方式，后来还迷上了举重。自从踏上这条路，这位健身爱好者不仅练出了令人惊叹的肌肉，还在社交媒体上收获了大批粉丝。这位广受喜爱的奶奶经常发布健身内容，她觉得别人没理由练不出这样的状态。她坦言，能做到这些，关键在于几点。“要坚持：把失败当成成功的垫脚石，千万别放弃。按计划走，”她说道，“要助人：前行路上多帮衬他人。成功与人分享，才更有滋味。”她之前也说过：“健身不非得有副好身材……目标是让自己舒服，不是为了好看。”以前总有人嘲笑多诺霍年纪太大，不适合健身，但她用最有力的方式证明了质疑者的错误，也确实激励了众多社交媒体用户。
"""
    segs = align_markdown(md)

    def tgt_for(*needles: str) -> str:
        for s in segs:
            if all(n in s["source"] for n in needles):
                return s["target"] or ""
        return ""

    assert "伊芙琳" in tgt_for("Evelyn Donohue")
    assert "七年前" in tgt_for("She only started to exercise")
    assert "饮食失调" in tgt_for("struggling", "eating")
    after = tgt_for("After that experience")
    assert "经历过这一切" in after
    assert "迷上了举重" not in after
    hold = tgt_for("Hold on")
    assert "坚持" in hold or "垫脚石" in hold
    assert "嘲笑" in tgt_for("Ms Donohue used to be laughed")


def test_missing_zh_leaves_gap_not_shift() -> None:
    """One missing Chinese sentence must not shift all later pairs."""
    md = (
        "## Source\n\n"
        "First English sentence is here for sure.\n\n"
        "Second English sentence is also present.\n\n"
        "Third English sentence ends the set.\n\n"
        "## Translation\n\n"
        "第一句中文译文在这里。\n\n"
        # missing second Chinese on purpose
        "第三句中文译文在这里。"
    )
    segs = align_markdown(md)
    assert len(segs) == 3
    assert "第一句" in segs[0]["target"]
    # Second should be empty (gap) rather than stealing the third translation
    assert segs[1]["target"] == "" or "第三句" not in segs[1]["target"]
    assert "第三句" in segs[2]["target"]


def test_freshman_shift_fixture_structure() -> None:
    """
    User-reported layout: inline section labels + alternating body.
    Missing ZH for 'She stressed...' shifts later pairs in raw zip —
    structure checks here; LLM realign repairs meaning when API is available.
    """
    md = """## Source As a freshman in high school, I faced numerous problems while learning English. It was a major challenge for me, and my progress was slow. Actually, I often felt defeated by the ups and downs of language learning. My attitude towards English was not positive, and it seemed like a very difficult task.

## Translation 作为一名高一新生，我在英语学习中遇到了很多问题。这对我来说是个不小的挑战，进步也十分缓慢。事实上，语言学习中的起起落落常常让我感到挫败。我对英语的态度并不积极，总觉得它是一项艰巨的任务。

One day, my English teacher noticed my problems and referred to my situation as a common type of challenge that many students face.

有一天，英语老师注意到了我的问题，她说这是很多学生都会遇到的普遍挑战。

She sat with me and provided specific suggestions on how to learn English.

她坐下来，给我提供了具体的英语学习建议。

She stressed the importance of having the right attitude and determination, which she said were key factors in overcoming the difficulties.

她向我推荐了一些传统方法，比如坚持写词汇日记，把新单词和我喜欢的电影角色联系起来记忆。

She recommended traditional methods to me, like keeping a vocabulary journal and connecting new words with characters in my favorite movies.

这让学习过程变得有趣多了。

It made the learning process more fun.

在她的悉心指导下，我的英语能力开始快速提升。

With her perfect instruction, my English skills began to improve quickly.

我明白了，态度是影响学习进度的重要因素，既能阻碍也能助力进步。

I learned that my attitude was an important aspect that could either affect or help my progress.

这段经历让我懂得，只要方法得当，任何困难都能被克服。

This experience taught me that with the right means, any difficulty can be overcome.

这正印证了那句老话：“有志者，事竟成。

It proves the saying, “Where there’s a will, there’s a way.”
"""
    from app.segments.verify import alignment_suspicion

    segs = align_markdown(md)
    assert len(segs) >= 8
    assert all(not s["source"].lower().startswith("source") for s in segs)
    assert all("##" not in s["source"] for s in segs)
    # All later English body sentences must be present as sources
    joined = " ".join(s["source"] for s in segs)
    assert "She stressed" in joined
    assert "She recommended" in joined
    assert "It proves the saying" in joined
    # With ≥2 extracted pairs, realign must be scheduled
    suspicion = alignment_suspicion(segs)
    assert suspicion["needs_realign"] is True
    assert suspicion["extracted"] >= 2
