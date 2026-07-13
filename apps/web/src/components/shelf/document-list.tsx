export type ShelfDocument = {
  id: string;
  title: string;
  status: string;
  shelfVisibility: string;
  sourceFilename: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  publishedAt: string | Date | null;
  ownerId: string;
};

type DocumentListProps = {
  documents: ShelfDocument[];
  emptyTitle: string;
  emptyDescription: string;
  showStatus?: boolean;
  allowDelete?: boolean;
  deletingId?: string | null;
  onDelete?: (doc: ShelfDocument) => void;
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "已上传",
  processing: "处理中",
  review: "待审阅",
  published: "已发布",
  failed: "失败",
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

export function DocumentList({
  documents,
  emptyTitle,
  emptyDescription,
  showStatus = true,
  allowDelete = false,
  deletingId = null,
  onDelete,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {emptyTitle}
        </h2>
        <p className="mt-2 text-sm text-zinc-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
      {documents.map((doc) => (
        <li key={doc.id}>
          <div className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900/60">
            <a href={docHref(doc)} className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {doc.title}
              </p>
              <p className="text-xs text-zinc-500">
                {doc.sourceFilename ? `${doc.sourceFilename} · ` : ""}
                更新于 {formatDate(doc.updatedAt)}
                {doc.publishedAt
                  ? ` · 发布于 ${formatDate(doc.publishedAt)}`
                  : ""}
              </p>
            </a>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              {showStatus && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
              )}
              <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                {doc.shelfVisibility === "public" ? "公开" : "私有"}
              </span>
              {allowDelete && onDelete && (
                <button
                  type="button"
                  disabled={deletingId === doc.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                  className="rounded-lg border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  {deletingId === doc.id ? "删除中…" : "删除"}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
