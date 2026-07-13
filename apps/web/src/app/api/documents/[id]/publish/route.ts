import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAnchorResolvable } from "@/lib/annotations/resolve-server";
import { db } from "@/lib/db";
import { annotations, documentRevisions, documents } from "@/lib/db/schema";
import {
  getDocumentById,
  getLatestRevision,
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

  // Capture previous latest revision before creating a new one (re-publish path)
  const previousRevision = await getLatestRevision(doc.id);

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

  // Re-bind annotations that pointed at the previous revision onto the new one.
  // Keep anchors when exact quote still appears; otherwise mark orphaned.
  let reanchored = 0;
  let orphaned = 0;
  if (previousRevision && previousRevision.id !== revision.id) {
    const rows = await db
      .select({
        id: annotations.id,
        anchor: annotations.anchor,
      })
      .from(annotations)
      .where(
        and(
          eq(annotations.documentId, doc.id),
          eq(annotations.revisionId, previousRevision.id),
        ),
      );

    if (rows.length > 0) {
      const keepIds: string[] = [];
      const orphanIds: string[] = [];

      for (const row of rows) {
        if (isAnchorResolvable(row.anchor, draft, bodyHtml)) {
          keepIds.push(row.id);
        } else {
          orphanIds.push(row.id);
        }
      }

      if (keepIds.length > 0) {
        await db
          .update(annotations)
          .set({
            revisionId: revision.id,
            orphaned: false,
            updatedAt: now,
          })
          .where(inArray(annotations.id, keepIds));
        reanchored = keepIds.length;
      }

      if (orphanIds.length > 0) {
        await db
          .update(annotations)
          .set({
            revisionId: revision.id,
            orphaned: true,
            updatedAt: now,
          })
          .where(inArray(annotations.id, orphanIds));
        orphaned = orphanIds.length;
      }
    }
  }

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
    annotations: {
      reanchored,
      orphaned,
    },
  });
}
