"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  documentId: string;
  initialVisibility: "private" | "public" | string;
  compact?: boolean;
};

export function ShelfVisibilityToggle({
  documentId,
  initialVisibility,
  compact = false,
}: Props) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPublic = visibility === "public";

  function toggle() {
    setError(null);
    const next = isPublic ? "private" : "public";
    startTransition(async () => {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelfVisibility: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "更新失败");
        return;
      }
      setVisibility(next);
      router.refresh();
    });
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-700 hover:bg-black/5 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-white/10"
          title={isPublic ? "当前公开" : "当前私有"}
        >
          {isPublic ? "公开" : "私有"}
        </button>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {isPublic ? "从公共书架撤回" : "发布到公共书架"}
      </button>
      <span className="text-xs text-zinc-500">
        当前：{isPublic ? "公开" : "私有"}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
