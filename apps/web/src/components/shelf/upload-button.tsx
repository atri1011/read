"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick() {
    setError(null);
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    startTransition(async () => {
      setError(null);
      const form = new FormData();
      form.set("file", file);
      try {
        const res = await fetch("/api/documents", {
          method: "POST",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          documentId?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "上传失败");
          return;
        }
        const id = data.id ?? data.documentId;
        if (id) {
          router.push(`/app/docs/${id}/review`);
          router.refresh();
        } else {
          setError("上传成功但未返回文档 id");
        }
      } catch {
        setError("网络错误");
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={onPick}
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "上传中…" : "上传文章"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
