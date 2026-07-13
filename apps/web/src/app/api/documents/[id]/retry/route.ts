import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documents, parseJobs } from "@/lib/db/schema";
import { getDocumentById, isOwner } from "@/lib/documents/access";
import { enqueueParseJob } from "@/lib/queue";

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
    return NextResponse.json({ error: "无权重试" }, { status: 403 });
  }

  if (doc.status !== "failed") {
    return NextResponse.json(
      { error: "仅失败的文档可重新解析" },
      { status: 400 },
    );
  }

  if (!doc.sourcePath) {
    return NextResponse.json(
      { error: "缺少源文件，无法重试" },
      { status: 400 },
    );
  }

  const now = new Date();

  try {
    const [job] = await db
      .insert(parseJobs)
      .values({
        documentId: doc.id,
        status: "queued",
        attempts: 0,
        progress: { stage: "queued", page: 0, total: 0 },
      })
      .returning({ id: parseJobs.id });

    await db
      .update(documents)
      .set({
        status: "processing",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(documents.id, doc.id));

    await enqueueParseJob({ jobId: job.id, documentId: doc.id });

    return NextResponse.json({
      documentId: doc.id,
      jobId: job.id,
      status: "processing",
    });
  } catch (err) {
    console.error("retry enqueue failed", err);
    try {
      await db
        .update(documents)
        .set({
          status: "failed",
          errorMessage: "重新入队失败",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
    } catch (cleanupErr) {
      console.error("retry cleanup failed", cleanupErr);
    }
    return NextResponse.json({ error: "重试失败" }, { status: 500 });
  }
}
