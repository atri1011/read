"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DocumentList,
  type ShelfDocument,
} from "@/components/shelf/document-list";
import { UploadDropzone } from "@/components/shelf/upload-dropzone";
import { isActiveParseStatus } from "@/lib/documents/job-progress";

type Scope = "mine" | "public";

const POLL_MS = 2000;

export function ShelfTabs() {
  const [scope, setScope] = useState<Scope>("mine");
  const [documents, setDocuments] = useState<ShelfDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (nextScope: Scope, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/documents?scope=${nextScope}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        documents?: ShelfDocument[];
        error?: string;
      };
      if (!res.ok) {
        if (!silent) {
          setError(data.error ?? "加载失败");
          setDocuments([]);
        }
        return;
      }
      setDocuments(data.documents ?? []);
      if (!silent) setError(null);
    } catch {
      if (!silent) {
        setError("网络错误");
        setDocuments([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  const hasActiveParse =
    scope === "mine" &&
    documents.some((d) => isActiveParseStatus(d.status));

  // While any document is still parsing, silently refresh list + progress.
  useEffect(() => {
    if (!hasActiveParse) return;
    const t = setInterval(() => {
      void load("mine", { silent: true });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [hasActiveParse, load]);

  const handleDelete = useCallback(async (doc: ShelfDocument) => {
    const ok = window.confirm(`确定删除《${doc.title}》？此操作不可恢复。`);
    if (!ok) return;

    setDeletingId(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "删除失败");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError("网络错误");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const activeCount = documents.filter((d) =>
    isActiveParseStatus(d.status),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            书架
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理你的文章，或浏览实例内的公开阅读材料。
            {scope === "mine" && activeCount > 0 && (
              <span className="ml-1 text-amber-700 dark:text-amber-300">
                · {activeCount} 篇处理中（自动刷新）
              </span>
            )}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-200/80 bg-white/80 p-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
          {(
            [
              { id: "mine", label: "我的" },
              { id: "public", label: "公开" },
            ] as const
          ).map((tab) => {
            const active = scope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={
                  active
                    ? "rounded-lg bg-[var(--shelf-card-fg)] px-4 py-1.5 text-sm font-medium text-[var(--shelf-card-bg)]"
                    : "rounded-lg px-4 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {scope === "mine" && (
        <UploadDropzone onUploaded={() => void load("mine")} />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-2xl border border-[var(--shelf-card-border)] bg-[var(--shelf-card-bg)]"
            />
          ))}
          <p className="col-span-full pt-2 text-center text-sm text-zinc-400">
            加载书架…
          </p>
        </div>
      ) : scope === "mine" ? (
        <DocumentList
          documents={documents}
          emptyTitle="还没有文章"
          emptyDescription="把 TXT / MD / PDF 拖到上方区域，或点击选择文件（可多选）。处理完成后可在此审阅与发布。"
          showStatus
          allowDelete
          deletingId={deletingId}
          onDelete={(doc) => void handleDelete(doc)}
        />
      ) : (
        <DocumentList
          documents={documents}
          emptyTitle="暂无公开文章"
          emptyDescription="当有人把已发布文章设为公开时，会出现在这里。"
          showStatus={false}
        />
      )}
    </div>
  );
}
