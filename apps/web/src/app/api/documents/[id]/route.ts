import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  canReadPublished,
  getDocumentById,
  getLatestRevision,
  isOwner,
} from "@/lib/documents/access";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    draftMarkdown: z.string().max(2_000_000).optional(),
    shelfVisibility: z.enum(["private", "public"]).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.draftMarkdown !== undefined ||
      v.shelfVisibility !== undefined,
    { message: "no fields" },
  );

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  const owner = isOwner(doc, user);
  if (!owner && !canReadPublished(doc, user)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const latestRevision = doc.status === "published"
    ? await getLatestRevision(doc.id)
    : null;

  if (owner) {
    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        shelfVisibility: doc.shelfVisibility,
        sourceMime: doc.sourceMime,
        sourceFilename: doc.sourceFilename,
        draftMarkdown: doc.draftMarkdown,
        errorMessage: doc.errorMessage,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        publishedAt: doc.publishedAt,
        ownerId: doc.ownerId,
        isOwner: true,
      },
      revision: latestRevision
        ? {
            id: latestRevision.id,
            version: latestRevision.version,
            bodyHtml: latestRevision.bodyHtml,
            createdAt: latestRevision.createdAt,
          }
        : null,
    });
  }

  // non-owner: published+public only, no draft
  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      shelfVisibility: doc.shelfVisibility,
      sourceFilename: doc.sourceFilename,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      publishedAt: doc.publishedAt,
      ownerId: doc.ownerId,
      isOwner: false,
    },
    revision: latestRevision
      ? {
          id: latestRevision.id,
          version: latestRevision.version,
          bodyHtml: latestRevision.bodyHtml,
          createdAt: latestRevision.createdAt,
        }
      : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
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
    return NextResponse.json({ error: "无权修改" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const { title, draftMarkdown, shelfVisibility } = parsed.data;
  const updates: Partial<typeof documents.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (title !== undefined) {
    updates.title = title;
  }

  if (draftMarkdown !== undefined) {
    if (doc.status !== "review" && doc.status !== "published") {
      return NextResponse.json(
        { error: "仅审阅或已发布文档可编辑草稿" },
        { status: 400 },
      );
    }
    updates.draftMarkdown = draftMarkdown;
  }

  if (shelfVisibility !== undefined) {
    if (doc.status !== "published") {
      return NextResponse.json(
        { error: "仅已发布文档可设置书架可见性" },
        { status: 400 },
      );
    }
    updates.shelfVisibility = shelfVisibility;
  }

  const [updated] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, doc.id))
    .returning({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      shelfVisibility: documents.shelfVisibility,
      draftMarkdown: documents.draftMarkdown,
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
    });

  return NextResponse.json({ document: updated });
}
