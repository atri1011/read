import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { parseJobs } from "@/lib/db/schema";
import { getDocumentById, isOwner } from "@/lib/documents/access";

type RouteContext = { params: Promise<{ id: string }> };

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
  if (!isOwner(doc, user)) {
    return NextResponse.json({ error: "无权查看任务" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: parseJobs.id,
      documentId: parseJobs.documentId,
      status: parseJobs.status,
      attempts: parseJobs.attempts,
      progress: parseJobs.progress,
      error: parseJobs.error,
      createdAt: parseJobs.createdAt,
      startedAt: parseJobs.startedAt,
      finishedAt: parseJobs.finishedAt,
    })
    .from(parseJobs)
    .where(eq(parseJobs.documentId, doc.id))
    .orderBy(desc(parseJobs.createdAt))
    .limit(1);

  const job = rows[0] ?? null;
  if (!job) {
    return NextResponse.json({ job: null });
  }

  const progress =
    job.progress && typeof job.progress === "object" && !Array.isArray(job.progress)
      ? (job.progress as Record<string, unknown>)
      : null;

  const page =
    progress && typeof progress.page === "number"
      ? progress.page
      : progress && typeof progress.page === "string"
        ? Number(progress.page) || 0
        : 0;
  const total =
    progress && typeof progress.total === "number"
      ? progress.total
      : progress && typeof progress.total === "string"
        ? Number(progress.total) || 0
        : 0;
  const stage =
    progress && typeof progress.stage === "string" ? progress.stage : null;

  return NextResponse.json({
    job: {
      id: job.id,
      documentId: job.documentId,
      status: job.status,
      attempts: job.attempts,
      progress: progress
        ? {
            stage,
            page,
            total,
            ...progress,
          }
        : null,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
  });
}
