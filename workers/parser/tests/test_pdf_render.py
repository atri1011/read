from __future__ import annotations

from pathlib import Path

import fitz

from app.pdf_render import render_pdf_pages


def _make_sample_pdf(path: Path, pages: int = 2) -> Path:
    doc = fitz.open()
    try:
        for i in range(pages):
            page = doc.new_page(width=300, height=200)
            page.insert_text((50, 80), f"Sample page {i + 1}", fontsize=14)
        doc.save(path.as_posix())
    finally:
        doc.close()
    return path


def test_render_pdf_pages_writes_pngs(tmp_path: Path) -> None:
    pdf_path = _make_sample_pdf(tmp_path / "sample.pdf", pages=2)
    out_dir = tmp_path / "pages"

    paths = render_pdf_pages(pdf_path, out_dir, dpi=72)

    assert len(paths) == 2
    assert paths[0].name == "page-0001.png"
    assert paths[1].name == "page-0002.png"
    for p in paths:
        assert p.is_file()
        assert p.stat().st_size > 0
        assert p.parent == out_dir


def test_render_pdf_pages_single_page(tmp_path: Path) -> None:
    pdf_path = _make_sample_pdf(tmp_path / "one.pdf", pages=1)
    paths = render_pdf_pages(pdf_path, tmp_path / "out", dpi=160)
    assert len(paths) == 1
    assert paths[0].name == "page-0001.png"
    assert paths[0].stat().st_size > 0
