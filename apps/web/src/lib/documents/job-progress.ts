export type JobProgress = {
  stage: string | null;
  page: number;
  total: number;
};

export type ShelfJobSummary = {
  status: string;
  progress: JobProgress | null;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Normalize jsonb progress from parse_jobs into a stable shape. */
export function normalizeJobProgress(raw: unknown): JobProgress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const progress = raw as Record<string, unknown>;
  const stage =
    typeof progress.stage === "string" && progress.stage.length > 0
      ? progress.stage
      : null;
  return {
    stage,
    page: asNumber(progress.page),
    total: asNumber(progress.total),
  };
}

/** Human-readable Chinese label for parse job progress. */
export function progressLabel(progress: JobProgress | null | undefined): string {
  if (!progress) return "准备中…";
  const stage = progress.stage ?? "processing";
  const page = progress.page ?? 0;
  const total = progress.total ?? 0;

  if (stage === "render") {
    return total > 0 ? `正在渲染 PDF（共 ${total} 页）…` : "正在渲染 PDF…";
  }
  if (stage === "vision") {
    if (total > 0) return `视觉识别：${page}/${total} 页`;
    return "视觉模型识别中…";
  }
  if (stage === "importing_text") return "正在导入文本…";
  if (stage === "segment") return "正在切句并对齐译文…";
  if (stage === "realign") {
    if (total > 0) return `正在核对原文与译文：${page}/${total} 句`;
    return "正在核对原文与译文对齐…";
  }
  if (stage === "translate") {
    if (total > 0) return `正在补译：${page}/${total} 句`;
    return "正在生成中文译文…";
  }
  if (stage === "done") return "处理完成";
  if (stage === "queued") return "已排队，等待空闲 worker…";
  return `处理中（${stage}）`;
}

export function isActiveParseStatus(status: string): boolean {
  return status === "processing" || status === "uploaded";
}

/**
 * Document.status is set to "processing" at upload time even while the job is
 * still queued. Prefer job.status so the shelf can show 排队中 vs 处理中.
 */
export function shelfStatusLabel(
  docStatus: string,
  job?: ShelfJobSummary | null,
): string {
  if (isActiveParseStatus(docStatus)) {
    if (job?.status === "queued") return "排队中";
    if (job?.status === "running") return "处理中";
    if (docStatus === "uploaded") return "已上传";
    return "处理中";
  }
  const labels: Record<string, string> = {
    review: "待审阅",
    published: "已发布",
    failed: "失败",
  };
  return labels[docStatus] ?? docStatus;
}

export function shelfDetailLabel(
  docStatus: string,
  job?: ShelfJobSummary | null,
): string | null {
  if (!isActiveParseStatus(docStatus)) return null;
  if (!job || job.status === "queued") {
    return "已入队，等待 worker 空闲（若另一个文件还在跑，可能是串行）…";
  }
  if (job.status === "running") {
    return progressLabel(job.progress);
  }
  return progressLabel(job.progress);
}

/** Compact badge text for shelf list (shorter than full progressLabel). */
export function progressBadgeText(
  docStatus: string,
  job?: ShelfJobSummary | null,
): string | null {
  if (!isActiveParseStatus(docStatus)) return null;
  if (!job || job.status === "queued") return "等待 worker";
  const progress = job.progress;
  if (!progress) return "执行中";
  const stage = progress.stage ?? "processing";
  const page = progress.page ?? 0;
  const total = progress.total ?? 0;
  if (stage === "vision" && total > 0) return `${page}/${total} 页`;
  if (stage === "translate" && total > 0) return `补译 ${page}/${total}`;
  if (stage === "render") return total > 0 ? `渲染 ${total} 页` : "渲染中";
  if (stage === "importing_text") return "导入文本";
  if (stage === "segment") return "切句中";
  if (stage === "realign") return total > 0 ? `核对 ${page}/${total}` : "核对对齐";
  if (stage === "queued") return "排队中";
  if (stage === "done") return "即将完成";
  return stage;
}
