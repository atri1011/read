"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SegmentEditor } from "@/components/review/segment-editor";
import {
  progressLabel,
  type JobProgress,
} from "@/lib/documents/job-progress";
import type {
  BilingualSegment,
  DraftSegmentsPayload,
} from "@/lib/segments/types";

type MarkdownEditorProps = {
  documentId: string;
  initialTitle: string;
  initialMarkdown: string;
  initialSegments?: DraftSegmentsPayload | null;
  status: string;
  errorMessage?: string | null;
};

type LatestJobResponse = {
  job?: {
    id: string;
    status: string;
    progress: JobProgress | null;
    error?: { code?: string; message?: string } | null;
  } | null;
};

function segmentsEqual(
  a: BilingualSegment[],
  b: BilingualSegment[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.id === b[i]?.id &&
      s.source === b[i]?.source &&
      s.target === b[i]?.target &&
      s.origin === b[i]?.origin,
  );
}

export function MarkdownEditor({
  documentId,
  initialTitle,
  initialMarkdown,
  initialSegments = null,
  status: initialStatus,
  errorMessage: initialErrorMessage,
}: MarkdownEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [segments, setSegments] = useState<BilingualSegment[]>(
    initialSegments?.segments ?? [],
  );
  const [useSegments, setUseSegments] = useState(
    (initialSegments?.segments?.length ?? 0) > 0,
  );
  const [status, setStatus] = useState(initialStatus);
  const [docError, setDocError] = useState<string | null>(
    initialErrorMessage ?? null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [retrying, setRetrying] = useState(false);

  const canEdit = status === "review" || status === "published";
  const initialSegList = initialSegments?.segments ?? [];
  const dirty = useMemo(() => {
    if (title !== initialTitle) return true;
    if (useSegments) {
      return !segmentsEqual(segments, initialSegList);
    }
    return markdown !== initialMarkdown;
  }, [
    title,
    markdown,
    segments,
    useSegments,
    initialTitle,
    initialMarkdown,
    initialSegList,
  ]);

  const percent = useMemo(() => {
    const page = progress?.page ?? 0;
    const total = progress?.total ?? 0;
    if (total <= 0) return null;
    return Math.min(100, Math.round((page / total) * 100));
  }, [progress]);

  useEffect(() => {
    let cancelled = false;
    if (useSegments && segments.length > 0) {
      const html = segments
        .map((s) => {
          const src = s.source
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const tgt = s.target
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<div class="mb-3"><p>${src}</p>${
            tgt ? `<p class="text-zinc-500">${tgt}</p>` : ""
          }</div>`;
        })
        .join("");
      if (!cancelled) setPreviewHtml(html);
      return () => {
        cancelled = true;
      };
    }

    const escaped = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = escaped
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split("\n").join("<br />");
        if (lines.startsWith("# ")) {
          return `<h1>${lines.slice(2)}</h1>`;
        }
        if (lines.startsWith("## ")) {
          return `<h2>${lines.slice(3)}</h2>`;
        }
        if (lines.startsWith("### ")) {
          return `<h3>${lines.slice(4)}</h3>`;
        }
        return `<p>${lines}</p>`;
      })
      .join("");
    if (!cancelled) setPreviewHtml(html);
    return () => {
      cancelled = true;
    };
  }, [markdown, segments, useSegments]);

  // poll document + job progress while processing / uploaded
  useEffect(() => {
    if (status !== "processing" && status !== "uploaded") return;

    let cancelled = false;

    async function tick() {
      try {
        const [docRes, jobRes] = await Promise.all([
          fetch(`/api/documents/${documentId}`, { cache: "no-store" }),
          fetch(`/api/documents/${documentId}/jobs/latest`, {
            cache: "no-store",
          }),
        ]);

        if (!cancelled && jobRes.ok) {
          const jobData = (await jobRes.json()) as LatestJobResponse;
          if (jobData.job?.progress) {
            setProgress({
              stage: jobData.job.progress.stage ?? null,
              page: Number(jobData.job.progress.page ?? 0) || 0,
              total: Number(jobData.job.progress.total ?? 0) || 0,
            });
          }
        }

        if (!cancelled && docRes.ok) {
          const data = (await docRes.json()) as {
            document?: {
              status: string;
              draftMarkdown: string | null;
              draftSegments?: DraftSegmentsPayload | null;
              title: string;
              errorMessage?: string | null;
            };
          };
          if (!data.document) return;
          setStatus(data.document.status);
          if (data.document.draftMarkdown != null) {
            setMarkdown(data.document.draftMarkdown);
          }
          if (data.document.draftSegments?.segments) {
            setSegments(data.document.draftSegments.segments);
            setUseSegments(data.document.draftSegments.segments.length > 0);
          }
          if (data.document.title) setTitle(data.document.title);
          if (data.document.errorMessage !== undefined) {
            setDocError(data.document.errorMessage);
          }
          if (
            data.document.status === "review" ||
            data.document.status === "failed" ||
            data.document.status === "published"
          ) {
            router.refresh();
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }

    void tick();
    const t = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [status, documentId, router]);

  async function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const body =
        useSegments && segments.length > 0
          ? {
              title,
              draftSegments: { version: 1 as const, segments },
            }
          : { title, draftMarkdown: markdown };

      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setMessage("已保存");
      router.refresh();
    });
  }

  async function publish() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      if (dirty) {
        const body =
          useSegments && segments.length > 0
            ? {
                title,
                draftSegments: { version: 1 as const, segments },
              }
            : { title, draftMarkdown: markdown };
        const saveRes = await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!saveRes.ok) {
          const data = (await saveRes.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? "保存失败");
          return;
        }
      }

      const res = await fetch(`/api/documents/${documentId}/publish`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "发布失败");
        return;
      }
      setStatus("published");
      setMessage("已发布");
      router.push(`/app/docs/${documentId}/read`);
      router.refresh();
    });
  }

  async function retryParse() {
    setError(null);
    setMessage(null);
    setRetrying(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/retry`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "重试失败");
        return;
      }
      setStatus("processing");
      setDocError(null);
      setProgress({ stage: "queued", page: 0, total: 0 });
      setMessage("已重新排队解析");
      router.refresh();
    } catch {
      setError("重试失败");
    } finally {
      setRetrying(false);
    }
  }

  if (status === "processing" || status === "uploaded") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          正在处理文档…
        </p>
        <p className="mt-2 text-sm text-zinc-500">{progressLabel(progress)}</p>
        {percent != null && (
          <div className="mx-auto mt-5 max-w-md">
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>
                {progress?.page ?? 0}/{progress?.total ?? 0}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-100"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-400">文档状态：{status}</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 dark:border-red-900 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          处理失败
        </p>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          {docError || errorMessageFallback()}
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="status">
            {error}
          </p>
        )}
        {message && (
          <p
            className="mt-3 text-sm text-emerald-800 dark:text-emerald-200"
            role="status"
          >
            {message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void retryParse()}
            disabled={retrying}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {retrying ? "重新排队中…" : "重试解析"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit || pending}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          aria-label="标题"
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || pending}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={!canEdit || pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            发布
          </button>
        </div>
      </div>

      {(error || message) && (
        <p
          role="status"
          className={
            error
              ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          }
        >
          {error ?? message}
        </p>
      )}

      {segments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setUseSegments(true)}
            className={
              useSegments
                ? "rounded-full bg-zinc-900 px-3 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-full border border-zinc-300 px-3 py-1 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
            }
          >
            句对编辑
          </button>
          <button
            type="button"
            onClick={() => setUseSegments(false)}
            className={
              !useSegments
                ? "rounded-full bg-zinc-900 px-3 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-full border border-zinc-300 px-3 py-1 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
            }
          >
            原始 Markdown
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[28rem] flex-col">
          <span className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            {useSegments && segments.length > 0 ? "双语句对" : "Markdown"}
          </span>
          {useSegments && segments.length > 0 ? (
            <div className="min-h-[28rem] flex-1 overflow-auto">
              <SegmentEditor
                segments={segments}
                disabled={!canEdit || pending}
                onChange={setSegments}
              />
            </div>
          ) : (
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              disabled={!canEdit || pending}
              className="min-h-[28rem] flex-1 resize-y rounded-xl border border-zinc-200 bg-white p-4 font-mono text-sm leading-relaxed text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              spellCheck={false}
            />
          )}
        </div>
        <div className="flex min-h-[28rem] flex-col">
          <span className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            预览（简化）
          </span>
          <div
            className="prose prose-zinc min-h-[28rem] max-w-none flex-1 overflow-auto rounded-xl border border-zinc-200 bg-white p-4 dark:prose-invert dark:border-zinc-700 dark:bg-zinc-950"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}

function errorMessageFallback(): string {
  return "请点击重试，或重新上传。";
}
