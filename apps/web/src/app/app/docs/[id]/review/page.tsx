import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarkdownEditor } from "@/components/review/markdown-editor";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDocumentById, isOwner } from "@/lib/documents/access";
import { isDraftSegmentsPayload } from "@/lib/segments/types";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const doc = await getDocumentById(id);
  return { title: doc ? `审阅 · ${doc.title}` : "审阅" };
}

export default async function ReviewPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) notFound();
  if (!isOwner(doc, user)) {
    redirect("/app/shelf");
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            审阅
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {doc.title}
          </h1>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href="/app/shelf"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            返回书架
          </Link>
          {doc.status === "published" && (
            <Link
              href={`/app/docs/${doc.id}/read`}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              阅读
            </Link>
          )}
        </div>
      </div>

      <MarkdownEditor
        documentId={doc.id}
        initialTitle={doc.title}
        initialMarkdown={doc.draftMarkdown ?? ""}
        initialSegments={
          isDraftSegmentsPayload(doc.draftSegments) ? doc.draftSegments : null
        }
        status={doc.status}
        errorMessage={doc.errorMessage}
      />
    </div>
  );
}
