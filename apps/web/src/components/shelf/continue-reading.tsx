"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShelfDocument } from "@/components/shelf/document-list";
import { loadReaderProgress } from "@/lib/reader/progress";
import { titleAccentStyle } from "@/lib/shelf/title-accent";

type Props = {
  documents: ShelfDocument[];
};

type Candidate = {
  doc: ShelfDocument;
  ratio: number;
  updatedAt: number;
};

export function ContinueReading({ documents }: Props) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    const rows: Candidate[] = [];
    for (const doc of documents) {
      if (doc.status !== "published") continue;
      const saved = loadReaderProgress(doc.id);
      if (!saved) continue;
      // Skip barely started or essentially finished.
      if (saved.ratio < 0.03 || saved.ratio >= 0.98) continue;
      rows.push({ doc, ratio: saved.ratio, updatedAt: saved.updatedAt });
    }
    if (rows.length === 0) {
      setCandidate(null);
      return;
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    setCandidate(rows[0]!);
  }, [documents]);

  if (!candidate) return null;
  const pct = Math.round(candidate.ratio * 100);

  return (
    <section
      aria-label="继续阅读"
      className="rounded-2xl border border-[var(--shelf-card-border)] bg-[var(--shelf-card-bg)] p-4 shadow-sm"
      style={titleAccentStyle(candidate.doc.title)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--shelf-card-muted)]">
            继续阅读
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-[var(--shelf-card-fg)] sm:text-lg">
            {candidate.doc.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--shelf-card-muted)]">
            已读到 {pct}% · 点此回到上次位置
          </p>
          <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--shelf-card-muted)_18%,transparent)]">
            <div
              className="h-full rounded-full bg-[var(--shelf-accent,oklch(0.5_0.06_40))]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Link
          href={`/app/docs/${candidate.doc.id}/read`}
          className="shrink-0 rounded-lg bg-[var(--shelf-card-fg)] px-3 py-2 text-sm font-medium text-[var(--shelf-card-bg)] hover:opacity-90"
        >
          接着读
        </Link>
      </div>
    </section>
  );
}
