"use client";

import { useState } from "react";

type NotesPaneProps = {
  className?: string;
};

export function NotesPane({ className = "" }: NotesPaneProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop side pane */}
      <aside
        className={`hidden w-full max-w-sm shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex ${className}`}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            笔记
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">标注功能将在后续版本提供</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-zinc-400">
          暂无笔记
        </div>
      </aside>

      {/* Mobile drawer trigger + panel */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-30 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          笔记
        </button>
        {open && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <button
              type="button"
              aria-label="关闭笔记"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="relative z-10 max-h-[70vh] overflow-auto rounded-t-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  笔记
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  关闭
                </button>
              </div>
              <p className="py-10 text-center text-sm text-zinc-400">
                暂无笔记 · 标注功能将在后续版本提供
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
