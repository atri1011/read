import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { annotationsToMarkdown } from "@/lib/annotations/export";
import type { TextAnchor } from "@/lib/annotations/anchor";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import {
  canReadPublished,
  getDocumentById,
} from "@/lib/documents/access";

type RouteContext = { params: Promise<{ id: string }> };

function safeFilename(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "notes"}-notes.md`;
}

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
  if (!canReadPublished(doc, user)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(annotations)
    .where(
      and(
        eq(annotations.documentId, doc.id),
        eq(annotations.ownerId, user.id),
      ),
    )
    .orderBy(asc(annotations.createdAt));

  const md = annotationsToMarkdown(
    doc.title,
    rows.map((r) => ({
      type: r.type,
      color: r.color,
      body: r.body,
      visibility: r.visibility,
      orphaned: r.orphaned,
      createdAt: r.createdAt,
      anchor: r.anchor as TextAnchor,
    })),
  );

  const filename = safeFilename(doc.title);
  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
