import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReaderShell } from "@/components/reader/reader-shell";
import { ShelfVisibilityToggle } from "@/components/reader/shelf-visibility-toggle";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canReadPublished,
  getDocumentById,
  getLatestRevision,
  isOwner,
} from "@/lib/documents/access";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const doc = await getDocumentById(id);
  return { title: doc ? `阅读 · ${doc.title}` : "阅读" };
}

export default async function ReadPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) notFound();

  if (!canReadPublished(doc, user)) {
    if (isOwner(doc, user) && doc.status !== "published") {
      redirect(`/app/docs/${doc.id}/review`);
    }
    notFound();
  }

  if (doc.status !== "published") {
    if (isOwner(doc, user)) redirect(`/app/docs/${doc.id}/review`);
    notFound();
  }

  const revision = await getLatestRevision(doc.id);
  if (!revision) {
    if (isOwner(doc, user)) redirect(`/app/docs/${doc.id}/review`);
    notFound();
  }

  const owner = isOwner(doc, user);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <Link
            href="/app/shelf"
            className="shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            书架
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
            {doc.title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {owner && (
            <>
              <Link
                href={`/app/docs/${doc.id}/review`}
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                编辑
              </Link>
              <ShelfVisibilityToggle
                documentId={doc.id}
                initialVisibility={doc.shelfVisibility}
              />
            </>
          )}
        </div>
      </div>

      <ReaderShell
        documentId={doc.id}
        title={doc.title}
        bodyHtml={revision.bodyHtml}
        currentUserId={user.id}
      />
    </div>
  );
}
