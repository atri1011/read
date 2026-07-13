import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

const listSelect = {
  id: documents.id,
  title: documents.title,
  status: documents.status,
  shelfVisibility: documents.shelfVisibility,
  sourceFilename: documents.sourceFilename,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
  publishedAt: documents.publishedAt,
  ownerId: documents.ownerId,
} as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "mine";

  if (scope !== "mine" && scope !== "public") {
    return NextResponse.json(
      { error: "scope 必须是 mine 或 public" },
      { status: 400 },
    );
  }

  if (scope === "mine") {
    const rows = await db
      .select(listSelect)
      .from(documents)
      .where(eq(documents.ownerId, user.id))
      .orderBy(desc(documents.updatedAt));

    return NextResponse.json({ documents: rows, scope });
  }

  const rows = await db
    .select(listSelect)
    .from(documents)
    .where(
      and(
        eq(documents.status, "published"),
        eq(documents.shelfVisibility, "public"),
      ),
    )
    .orderBy(desc(documents.publishedAt));

  return NextResponse.json({ documents: rows, scope });
}
