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

  const ownerActions = owner ? (
    <>
      <Link
        href={`/app/docs/${doc.id}/review`}
        className="rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-700 hover:bg-black/5 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-white/10"
      >
        编辑
      </Link>
      <ShelfVisibilityToggle
        documentId={doc.id}
        initialVisibility={doc.shelfVisibility}
        compact
      />
    </>
  ) : null;

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col">
      <ReaderShell
        documentId={doc.id}
        title={doc.title}
        bodyHtml={revision.bodyHtml}
        currentUserId={user.id}
        ownerActions={ownerActions}
      />
    </div>
  );
}
