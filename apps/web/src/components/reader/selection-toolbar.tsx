"use client";

import { useEffect, useRef, useState } from "react";
import type { TextAnchor } from "@/lib/annotations/anchor";
import { buildAnchorFromSelection } from "@/lib/annotations/anchor";

export type ToolbarAction = {
  type: "highlight" | "underline" | "strikethrough" | "note";
  color?: "yellow" | "green" | "blue" | "pink";
  visibility: "private" | "public";
  body?: string;
  anchor: TextAnchor;
};

type Props = {
  rootRef: React.RefObject<HTMLElement | null>;
  onAnnotate: (action: ToolbarAction) => void | Promise<void>;
  disabled?: boolean;
};

const COLORS: Array<{ id: "yellow" | "green" | "blue" | "pink"; label: string; swatch: string }> =
  [
    { id: "yellow", label: "黄", swatch: "bg-yellow-300" },
    { id: "green", label: "绿", swatch: "bg-green-300" },
    { id: "blue", label: "蓝", swatch: "bg-blue-300" },
    { id: "pink", label: "粉", swatch: "bg-pink-300" },
  ];

type Pos = { top: number; left: number };

export function SelectionToolbar({ rootRef, onAnnotate, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const [anchor, setAnchor] = useState<TextAnchor | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [noteMode, setNoteMode] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Keep last non-collapsed selection range so clicks on toolbar don't lose it
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    function hide() {
      setVisible(false);
      setNoteMode(false);
      setNoteBody("");
      setError(null);
      setAnchor(null);
      savedRangeRef.current = null;
    }

    function updateFromSelection() {
      if (disabled) {
        hide();
        return;
      }
      const root = rootRef.current;
      if (!root) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // If focus moved into toolbar, keep showing
        const active = document.activeElement;
        if (barRef.current && active && barRef.current.contains(active)) {
          return;
        }
        hide();
        return;
      }

      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        hide();
        return;
      }

      const built = buildAnchorFromSelection(sel, root);
      if (!built) {
        hide();
        return;
      }

      savedRangeRef.current = range.cloneRange();
      setAnchor(built);
      setNoteMode(false);
      setNoteBody("");
      setError(null);

      // fixed positioning uses viewport coordinates
      const rect = range.getBoundingClientRect();
      const top = rect.top - 48;
      const left = rect.left + rect.width / 2;
      setPos({ top: Math.max(8, top), left: Math.max(80, left) });
      setVisible(true);
    }

    function onMouseUp(e: MouseEvent) {
      // Defer so selection is finalized
      if (barRef.current?.contains(e.target as Node)) return;
      window.setTimeout(updateFromSelection, 0);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Escape") {
        hide();
        return;
      }
      window.setTimeout(updateFromSelection, 0);
    }

    function onScroll() {
      if (!visible || !savedRangeRef.current) return;
      const rect = savedRangeRef.current.getBoundingClientRect();
      // Hide if selection scrolled far off-screen
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setVisible(false);
        return;
      }
      setPos({
        top: Math.max(8, rect.top - 48),
        left: Math.max(80, rect.left + rect.width / 2),
      });
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [rootRef, disabled, visible]);

  async function run(action: Omit<ToolbarAction, "anchor" | "visibility"> & { body?: string }) {
    if (!anchor || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAnnotate({
        ...action,
        visibility,
        anchor,
      });
      window.getSelection()?.removeAllRanges();
      setVisible(false);
      setNoteMode(false);
      setNoteBody("");
      setAnchor(null);
      savedRangeRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (!visible || !anchor) return null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="批注工具栏"
      className="fixed z-50 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => {
        // Prevent selection collapse when interacting with toolbar
        e.preventDefault();
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={`高亮 · ${c.label}`}
            disabled={busy}
            onClick={() => run({ type: "highlight", color: c.id })}
            className={`h-7 w-7 rounded-full border border-zinc-300 ${c.swatch} hover:ring-2 hover:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600`}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ type: "underline" })}
          className="rounded-md px-2 py-1 text-sm font-medium text-zinc-700 underline decoration-2 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          下划线
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ type: "strikethrough" })}
          className="rounded-md px-2 py-1 text-sm font-medium text-zinc-700 line-through hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          删除线
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setNoteMode((v) => !v)}
          className="rounded-md px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          笔记
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setVisibility((v) => (v === "private" ? "public" : "private"))
          }
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="批注可见性"
        >
          {visibility === "private" ? "私有" : "公开"}
        </button>
      </div>

      {noteMode && (
        <div className="mt-2 flex flex-col gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder="写点笔记…"
            className="w-64 resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setNoteMode(false)}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || !noteBody.trim()}
              onClick={() =>
                run({ type: "note", color: "yellow", body: noteBody.trim() })
              }
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              保存笔记
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
