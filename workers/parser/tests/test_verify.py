from __future__ import annotations

from app.segments.verify import (
    alignment_suspicion,
    apply_realign_map,
    is_bad_pair,
)


def test_is_bad_pair_empty_ok() -> None:
    assert is_bad_pair("Hello world.", "") is False


def test_is_bad_pair_length_outliers() -> None:
    long_en = "A" * 120
    tiny_zh = "短"
    short_en = "Hi."
    huge_zh = "这" * 80
    assert is_bad_pair(long_en, tiny_zh) is True
    assert is_bad_pair(short_en, huge_zh) is True
    assert is_bad_pair("Hello world, how are you today?", "你好，你今天怎么样？") is False


def test_suspicion_clean_pairs_false() -> None:
    segs = [
        {
            "id": "s-0",
            "source": "The cat sat on the mat quietly.",
            "target": "猫安静地坐在垫子上。",
            "origin": "extracted",
        },
        {
            "id": "s-1",
            "source": "It looked quite content after lunch.",
            "target": "午饭后它看起来很满足。",
            "origin": "extracted",
        },
        {
            "id": "s-2",
            "source": "Then it walked away slowly.",
            "target": "然后它慢慢走开了。",
            "origin": "extracted",
        },
    ]
    result = alignment_suspicion(segs)
    assert result["needs_realign"] is False
    assert result["extracted"] == 3
    assert result["bad"] == 0


def test_suspicion_shifted_length_true() -> None:
    segs = [
        {
            "id": "s-0",
            "source": "A" * 100,
            "target": "短",
            "origin": "extracted",
        },
        {
            "id": "s-1",
            "source": "Hi.",
            "target": "这是一段非常非常非常非常非常非常长的中文句子用来触发长度异常检测。",
            "origin": "extracted",
        },
        {
            "id": "s-2",
            "source": "B" * 90,
            "target": "又短",
            "origin": "extracted",
        },
    ]
    result = alignment_suspicion(segs)
    assert result["needs_realign"] is True
    assert result["bad"] >= 2


def test_apply_realign_response() -> None:
    segs = [
        {
            "id": "s-0",
            "source": "Hello world.",
            "target": "第二句。",
            "origin": "extracted",
        },
        {
            "id": "s-1",
            "source": "Second sentence.",
            "target": "你好，世界。",
            "origin": "extracted",
        },
    ]
    fixed = apply_realign_map(
        segs,
        {
            "s-0": "你好，世界。",
            "s-1": "第二句。",
        },
    )
    assert fixed[0]["target"] == "你好，世界。"
    assert fixed[1]["target"] == "第二句。"
    assert fixed[0]["source"] == "Hello world."
    assert fixed[0]["origin"] == "extracted"


def test_realign_rejects_english_targets() -> None:
    segs = [
        {
            "id": "s-0",
            "source": "Hello world.",
            "target": "你好。",
            "origin": "extracted",
        }
    ]
    fixed = apply_realign_map(segs, {"s-0": "This is English not Chinese."})
    assert fixed[0]["target"] == ""
    assert fixed[0]["origin"] == "generated"


def test_apply_clears_unmatched() -> None:
    segs = [
        {
            "id": "s-0",
            "source": "Hello world.",
            "target": "错配。",
            "origin": "extracted",
        }
    ]
    fixed = apply_realign_map(segs, {"s-0": ""})
    assert fixed[0]["target"] == ""
    assert fixed[0]["origin"] == "generated"
