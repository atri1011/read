"use client";

import { useCallback, useRef, useState } from "react";
import {
  uploadDocuments,
  type UploadFailure,
} from "@/lib/documents/upload-client";

const ACCEPT =
  ".txt,.md,.pdf,text/plain,text/markdown,application/pdf";

type UploadDropzoneProps = {
  onUploaded?: () => void;
};

export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => f && f.size > 0);
      if (files.length === 0) return;

      setPending(true);
      setError(null);
      setFailures([]);
      setSuccessCount(null);
      setProgress({ done: 0, total: files.length });

      try {
        const results = await uploadDocuments(files, {
          concurrency: 2,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        const failed = results.filter((r): r is UploadFailure => !r.ok);
        const okCount = results.length - failed.length;
        setFailures(failed);
        setSuccessCount(okCount);
        if (okCount === 0 && failed.length > 0) {
          setError(`全部上传失败（${failed.length}）`);
        } else if (failed.length > 0) {
          setError(`成功 ${okCount}，失败 ${failed.length}`);
        }
        if (okCount > 0) {
          onUploaded?.();
        }
      } catch {
        setError("网络错误");
      } finally {
        setPending(false);
        setProgress(null);
      }
    },
    [onUploaded],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (list?.length) void uploadFiles(list);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  const statusLabel = pending
    ? progress
      ? `上传中 ${progress.done}/${progress.total}…`
      : "上传中…"
    : "拖拽文件到此处，或点击选择（可多选）";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onChange}
      />
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!pending) inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!pending) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/60"
        } ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {statusLabel}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          支持 TXT / Markdown / PDF，可一次多选（建议每个 &lt; 50MB）
        </p>
        {successCount !== null && !pending && failures.length === 0 && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            已上传 {successCount} 个文件
          </p>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {failures.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
          {failures.map((f) => (
            <li key={`${f.file.name}-${f.error}`}>
              {f.file.name}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
