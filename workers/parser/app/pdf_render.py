from __future__ import annotations

from pathlib import Path

import fitz  # PyMuPDF


def render_pdf_pages(pdf_path: Path, out_dir: Path, dpi: int = 160) -> list[Path]:
    """Rasterize each PDF page to PNG under out_dir. Returns ordered page paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    paths: list[Path] = []
    try:
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            p = out_dir / f"page-{i + 1:04d}.png"
            pix.save(p.as_posix())
            paths.append(p)
    finally:
        doc.close()
    return paths
