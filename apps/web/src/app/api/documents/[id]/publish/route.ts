import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documentRevisions, documents } from "@/lib/db/schema";
import {
  getDocumentById,
  getNextRevisionVersion,
  isOwner,
} from "@/lib/documents/access";
import { markdownToHtml } from "@/lib/md/render";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (!isOwner(doc, user)) {
    return NextResponse.json({ error: "无权发布" }, { status: 403 });
  }

  if (doc.status !== "review" && doc.status !== "published") {
    return NextResponse.json(
      { error: "当前状态不可发布" },
      { status: 400 },
    );
  }

  const draft = doc.draftMarkdown;
  if (draft == null || draft.trim() === "") {
    return NextResponse.json({ error: "草稿为空，无法发布" }, { status: 400 });
  }

  const bodyHtml = await markdownToHtml(draft);
  const version = await getNextRevisionVersion(doc.id);
  const now = new Date();

  const [revision] = await db
    .insert(documentRevisions)
    .values({
      documentId: doc.id,
      version,
      markdown: draft,
      bodyHtml,
    })
    .returning({
      id: documentRevisions.id,
      version: documentRevisions.version,
      createdAt: documentRevisions.createdAt,
    });

  const [updated] = await db
    .update(documents)
    .set({
      status: "published",
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(documents.id, doc.id))
    .returning({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      shelfVisibility: documents.shelfVisibility,
      publishedAt: documents.publishedAt,
    });

  return NextResponse.json({
    document: updated,
    revision,
  });
}
