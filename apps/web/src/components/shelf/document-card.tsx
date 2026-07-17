import Link from "next/link";
import {
  isActiveParseStatus,
  progressBadgeText,
  shelfDetailLabel,
  shelfStatusLabel,
  type ShelfJobSummary,
} from "@/lib/documents/job-progress";
import { titleAccentStyle } from "@/lib/shelf/title-accent";
import type { ShelfDocument } from "@/components/shelf/document-list";
import { ReadingProgressBadge } from "@/components/shelf/reading-progress-badge";

type DocumentCardProps = {
  doc: ShelfDocument;
  showStatus?: boolean;
  allowDelete?: boolean;
  deleting?: boolean;
  onDelete?: (doc: ShelfDocument) => void;
};

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function docHref(doc: ShelfDocument): string {
  if (doc.status === "published") return `/app/docs/${doc.id}/read`;
  return `/app/docs/${doc.id}/review`;
}

function statusToneClass(docStatus: string, job?: ShelfJobSummary | null): string {
  if (docStatus === "failed") {
    return "bg-[var(--shelf-status-failed-bg)] text-[var(--shelf-status-failed-fg)]";
  }
  if (isActiveParseStatus(docStatus)) {
    if (job?.status === "queued") {
      return "bg-[var(--shelf-status-neutral-bg)] text-[var(--shelf-status-neutral-fg)]";
    }
    return "bg-[var(--shelf-status-processing-bg)] text-[var(--shelf-status-processing-fg)]";
  }
  if (docStatus === "review") {
    return "bg-[var(--shelf-status-review-bg)] text-[var(--shelf-status-review-fg)]";
  }
  if (docStatus === "published") {
    return "bg-[var(--shelf-status-published-bg)] text-[var(--shelf-status-published-fg)]";
  }
  return "bg-[var(--shelf-status-neutral-bg)] text-[var(--shelf-status-neutral-fg)]";
}

export function DocumentCard({
  doc,
  showStatus = true,
  allowDelete = false,
  deleting = false,
  onDelete,
}: DocumentCardProps) {
  const active = isActiveParseStatus(doc.status);
  const progress = doc.job?.progress ?? null;
  const detail = shelfDetailLabel(doc.status, doc.job);
  const badge = progressBadgeText(doc.status, doc.job);
  const statusText = shelfStatusLabel(doc.status, doc.job);
  const pct =
    active &&
    doc.job?.status === "running" &&
    progress &&
    progress.total > 0
      ? Math.min(100, Math.round((progress.page / progress.total) * 100))
      : null;

  return (
    <li className="min-w-0 list-none">
      <article
        className="shelf-card group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl"
        style={titleAccentStyle(doc.title)}
      >
        <div className="shelf-card-accent h-0.5 w-full shrink-0" aria-hidden />

        <div className="pointer-events-none absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1">
          {showStatus && (
            <span
              className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${statusToneClass(doc.status, doc.job)}`}
            >
              {active && (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current"
                  aria-hidden
                />
              )}
              <span className="truncate">
                {statusText}
                {badge ? ` · ${badge}` : ""}
              </span>
            </span>
          )}
          {doc.shelfVisibility === "public" && (
            <span className="rounded-full border border-[var(--shelf-card-border)] bg-[var(--shelf-card-bg)]/90 px-2 py-0.5 text-[11px] text-[var(--shelf-card-muted)]">
              公开
            </span>
          )}
          <ReadingProgressBadge
            documentId={doc.id}
            enabled={doc.status === "published"}
          />
        </div>

        {allowDelete && onDelete && (
          <button
            type="button"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(doc);
            }}
            className="absolute bottom-2 right-2 z-20 rounded-lg border border-red-200/80 bg-[var(--shelf-card-bg)]/95 px-2 py-1 text-[11px] font-medium text-red-700 opacity-100 shadow-sm transition-opacity hover:bg-red-50 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {deleting ? "删除中…" : "删除"}
          </button>
        )}

        <Link
          href={docHref(doc)}
          className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-card-fg)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-card-bg)]"
          title={doc.sourceFilename ?? doc.title}
        >
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <h2 className="line-clamp-4 text-center text-base font-semibold leading-snug tracking-tight text-[var(--shelf-card-fg)] sm:text-lg">
              {doc.title}
            </h2>
            {detail && (
              <div className="mt-3">
                <p
                  className={
                    doc.job?.status === "queued"
                      ? "text-center text-[11px] text-[var(--shelf-card-muted)]"
                      : "text-center text-[11px] text-[var(--shelf-status-processing-fg)]"
                  }
                >
                  {detail}
                </p>
                {pct !== null && (
                  <div
                    className="mx-auto mt-1.5 h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-[var(--shelf-status-processing-bg)]"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={detail}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--shelf-status-processing-fg)] transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="mt-auto truncate pt-3 text-center text-[11px] text-[var(--shelf-card-muted)]">
            更新于 {formatDate(doc.updatedAt)}
          </p>
        </Link>
      </article>
    </li>
  );
}
