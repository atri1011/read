import { DocumentCard } from "@/components/shelf/document-card";
import type { ShelfJobSummary } from "@/lib/documents/job-progress";

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
  /** Latest parse job summary; present while processing/uploaded. */
  job?: ShelfJobSummary | null;
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
      <div className="rounded-2xl border border-dashed border-[var(--shelf-slot-border)] bg-[var(--shelf-slot-bg)] px-4 py-10 sm:px-6">
        <div
          className="mx-auto grid max-w-md grid-cols-3 gap-3 opacity-50"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[4/5] rounded-xl border border-dashed border-[var(--shelf-card-border)] bg-[var(--shelf-card-bg)]/40"
            />
          ))}
        </div>
        <h2 className="mt-6 text-center text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {emptyTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-zinc-500">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          showStatus={showStatus}
          allowDelete={allowDelete}
          deleting={deletingId === doc.id}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
