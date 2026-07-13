"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DocumentList,
  type ShelfDocument,
} from "@/components/shelf/document-list";
import { UploadDropzone } from "@/components/shelf/upload-dropzone";

type Scope = "mine" | "public";

export function ShelfTabs() {
  const [scope, setScope] = useState<Scope>("mine");
  const [documents, setDocuments] = useState<ShelfDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (nextScope: Scope) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents?scope=${nextScope}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        documents?: ShelfDocument[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "加载失败");
        setDocuments([]);
        return;
      }
      setDocuments(data.documents ?? []);
    } catch {
      setError("网络错误");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            书架
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理你的文章，或浏览实例内的公开阅读材料。
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
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
                    ? "rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
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
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
            />
          ))}
          <p className="pt-2 text-center text-sm text-zinc-400">加载书架…</p>
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
