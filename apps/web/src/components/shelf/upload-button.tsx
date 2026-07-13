"use client";

import { useRef, useState } from "react";
import {
  uploadDocuments,
  type UploadFailure,
} from "@/lib/documents/upload-client";

type UploadButtonProps = {
  onUploaded?: () => void;
};

export function UploadButton({ onUploaded }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  function onPick() {
    setError(null);
    setFailures([]);
    inputRef.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;

    const files = Array.from(list).filter((f) => f.size > 0);
    if (files.length === 0) return;

    setPending(true);
    setError(null);
    setFailures([]);
    setProgress({ done: 0, total: files.length });
    try {
      const results = await uploadDocuments(files, {
        concurrency: 2,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const failed = results.filter((r): r is UploadFailure => !r.ok);
      const okCount = results.length - failed.length;
      setFailures(failed);
      if (okCount === 0 && failed.length > 0) {
        setError(`全部上传失败（${failed.length}）`);
      } else if (failed.length > 0) {
        setError(`成功 ${okCount}，失败 ${failed.length}`);
      }
      if (okCount > 0) onUploaded?.();
    } catch {
      setError("网络错误");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const label = pending
    ? progress
      ? `上传中 ${progress.done}/${progress.total}…`
      : "上传中…"
    : "上传文章";

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void onChange(e)}
      />
      <button
        type="button"
        onClick={onPick}
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {label}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {failures.length > 0 && (
        <ul className="max-w-xs space-y-1 text-xs text-red-600 dark:text-red-400">
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
