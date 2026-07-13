import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { patchAnnotationSchema } from "@/lib/annotations/types";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";

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

async function getOwnedAnnotation(id: string, userId: string) {
  const rows = await db
    .select()
    .from(annotations)
    .where(eq(annotations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return { error: "not_found" as const };
  if (row.ownerId !== userId) return { error: "forbidden" as const };
  return { row };
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await getOwnedAnnotation(id, user.id);
  if ("error" in result && result.error === "not_found") {
    return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  }
  if ("error" in result && result.error === "forbidden") {
    return NextResponse.json({ error: "无权修改" }, { status: 403 });
  }
  const existing = result.row!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const parsed = patchAnnotationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Partial<typeof annotations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.type !== undefined) updates.type = data.type;
  if (data.color !== undefined) updates.color = data.color;
  if (data.body !== undefined) updates.body = data.body;
  if (data.visibility !== undefined) updates.visibility = data.visibility;
  if (data.anchor !== undefined) updates.anchor = data.anchor;

  const [row] = await db
    .update(annotations)
    .set(updates)
    .where(eq(annotations.id, existing.id))
    .returning();

  return NextResponse.json({ annotation: serializeAnnotation(row!) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await getOwnedAnnotation(id, user.id);
  if ("error" in result && result.error === "not_found") {
    return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  }
  if ("error" in result && result.error === "forbidden") {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  await db.delete(annotations).where(eq(annotations.id, result.row!.id));
  return NextResponse.json({ ok: true });
}
