import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import path from "path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documents, parseJobs } from "@/lib/db/schema";
import {
  isActiveParseStatus,
  normalizeJobProgress,
  type ShelfJobSummary,
} from "@/lib/documents/job-progress";
import { enqueueParseJob } from "@/lib/queue";
import { saveUpload } from "@/lib/storage";

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

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXT = new Set([".txt", ".md", ".pdf"]);

const ALLOWED_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/pdf",
  "application/octet-stream",
]);

function titleFromFilename(filename: string): string {
  const base = path.basename(filename);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const cleaned = stem.trim() || "Untitled";
  return cleaned.slice(0, 200);
}

function isAllowedFile(filename: string, mime: string | null): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return false;
  if (!mime || mime === "") return true;
  if (ALLOWED_MIME.has(mime)) return true;
  // Some browsers send empty or odd mimes for .md
  if (ext === ".md" && mime.startsWith("text/")) return true;
  if (ext === ".txt" && mime.startsWith("text/")) return true;
  return false;
}

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

    const activeIds = rows
      .filter((r) => isActiveParseStatus(r.status))
      .map((r) => r.id);

    const jobByDoc = new Map<string, ShelfJobSummary>();
    if (activeIds.length > 0) {
      const jobs = await db
        .select({
          documentId: parseJobs.documentId,
          status: parseJobs.status,
          progress: parseJobs.progress,
          createdAt: parseJobs.createdAt,
        })
        .from(parseJobs)
        .where(inArray(parseJobs.documentId, activeIds))
        .orderBy(desc(parseJobs.createdAt));

      for (const job of jobs) {
        if (jobByDoc.has(job.documentId)) continue;
        jobByDoc.set(job.documentId, {
          status: job.status,
          progress: normalizeJobProgress(job.progress),
        });
      }
    }

    const documentsWithJobs = rows.map((row) => ({
      ...row,
      job: isActiveParseStatus(row.status)
        ? (jobByDoc.get(row.id) ?? null)
        : null,
    }));

    return NextResponse.json({ documents: documentsWithJobs, scope });
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

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "无效的表单数据" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传单个文件字段 file" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "文件为空" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件不能超过 50MB" }, { status: 400 });
  }

  const filename = file.name || "upload.bin";
  const mime = file.type || null;
  if (!isAllowedFile(filename, mime)) {
    return NextResponse.json(
      { error: "仅支持 .txt / .md / .pdf" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const title = titleFromFilename(filename);
  const now = new Date();

  let documentId: string | null = null;
  let jobId: string | null = null;
  let sourcePath: string | null = null;

  try {
    sourcePath = await saveUpload(user.id, filename, buffer);

    const [doc] = await db
      .insert(documents)
      .values({
        ownerId: user.id,
        title,
        status: "uploaded",
        shelfVisibility: "private",
        sourceMime: mime,
        sourceFilename: filename,
        sourcePath,
        updatedAt: now,
      })
      .returning({ id: documents.id });

    documentId = doc.id;

    const [job] = await db
      .insert(parseJobs)
      .values({
        documentId: doc.id,
        status: "queued",
        attempts: 0,
        progress: { stage: "queued", page: 0, total: 0 },
      })
      .returning({ id: parseJobs.id });

    jobId = job.id;

    await db
      .update(documents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documents.id, doc.id));

    await enqueueParseJob({ jobId: job.id, documentId: doc.id });

    return NextResponse.json(
      {
        id: doc.id,
        documentId: doc.id,
        jobId: job.id,
        status: "processing",
        title,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("upload failed", err);
    if (documentId) {
      try {
        await db
          .update(documents)
          .set({
            status: "failed",
            errorMessage: "上传入队失败",
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
        if (jobId) {
          await db
            .update(parseJobs)
            .set({
              status: "failed",
              error: { code: "enqueue_failed", message: String(err) },
              finishedAt: new Date(),
            })
            .where(eq(parseJobs.id, jobId));
        }
      } catch (cleanupErr) {
        console.error("upload cleanup failed", cleanupErr);
      }
    }
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
