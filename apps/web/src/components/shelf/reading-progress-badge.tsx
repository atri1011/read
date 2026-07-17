"use client";

import { useEffect, useState } from "react";
import { loadReaderProgress } from "@/lib/reader/progress";

type Props = {
  documentId: string;
  /** Only show for published docs that are readable. */
  enabled?: boolean;
};

export function ReadingProgressBadge({ documentId, enabled = true }: Props) {
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPct(null);
      return;
    }
    const saved = loadReaderProgress(documentId);
    if (!saved || saved.ratio < 0.02) {
      setPct(null);
      return;
    }
    setPct(Math.round(saved.ratio * 100));
  }, [documentId, enabled]);

  if (pct === null) return null;

  return (
    <span className="rounded-full border border-[var(--shelf-card-border)] bg-[var(--shelf-card-bg)]/90 px-2 py-0.5 text-[11px] text-[var(--shelf-card-muted)]">
      {pct >= 98 ? "已读完" : `读到 ${pct}%`}
    </span>
  );
}
