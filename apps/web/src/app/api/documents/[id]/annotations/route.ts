import { NextResponse } from "next/server";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createAnnotationSchema,
} from "@/lib/annotations/types";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import {
  canReadPublished,
  getDocumentById,
  getLatestRevision,
} from "@/lib/documents/access";

type RouteContext = { params: Promise<{ id: string }> };

function serializeAnnotation(row: typeof annotations.$inferSelect) {
  return {
    id: row.id,
    documentId: row.documentId,
    revisionId: row.revisionId,
    ownerId: row.ownerId,
    type: row.type,
    color: row.color,
    body: row.body,
    visibility: row.visibility,
    anchor: row.anchor,
    orphaned: row.orphaned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (!canReadPublished(doc, user)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const url = new URL(request.url);
  const includePublic =
    url.searchParams.get("include_public") === "1" ||
    url.searchParams.get("include_public") === "true";

  const condition = includePublic
    ? and(
        eq(annotations.documentId, doc.id),
        or(
          eq(annotations.ownerId, user.id),
          and(
            eq(annotations.visibility, "public"),
            ne(annotations.ownerId, user.id),
          ),
        ),
      )
    : and(
        eq(annotations.documentId, doc.id),
        eq(annotations.ownerId, user.id),
      );

  const rows = await db
    .select()
    .from(annotations)
    .where(condition)
    .orderBy(desc(annotations.createdAt));

  return NextResponse.json({
    annotations: rows.map(serializeAnnotation),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (!canReadPublished(doc, user)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  if (doc.status !== "published") {
    return NextResponse.json(
      { error: "仅已发布文档可标注" },
      { status: 400 },
    );
  }

  const revision = await getLatestRevision(doc.id);
  if (!revision) {
    return NextResponse.json({ error: "文档尚无修订版本" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const parsed = createAnnotationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const data = parsed.data;
  // highlight defaults to a color if missing
  const color =
    data.color ??
    (data.type === "highlight" || data.type === "note" ? "yellow" : null);

  const [row] = await db
    .insert(annotations)
    .values({
      documentId: doc.id,
      revisionId: revision.id,
      ownerId: user.id,
      type: data.type,
      color,
      body: data.body ?? null,
      visibility: data.visibility,
      anchor: data.anchor,
      orphaned: false,
    })
    .returning();

  return NextResponse.json(
    { annotation: serializeAnnotation(row!) },
    { status: 201 },
  );
}
