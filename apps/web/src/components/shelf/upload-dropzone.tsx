"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ACCEPT =
  ".txt,.md,.pdf,text/plain,text/markdown,application/pdf";

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();

  const uploadFile = useCallback(
    (file: File) => {
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
    },
    [router],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onChange}
      />
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
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
          {pending ? "上传中…" : "拖拽文件到此处，或点击选择"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          支持 TXT / Markdown / PDF（建议 &lt; 50MB）
        </p>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
