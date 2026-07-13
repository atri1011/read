"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TextAnchor } from "@/lib/annotations/anchor";
import { buildAnchorFromSelection } from "@/lib/annotations/anchor";

export type DictSense = {
  pos: string;
  en: string;
  zh: string;
};

export type DictResult = {
  query: string;
  phonetic: string | null;
  senses: DictSense[];
  note?: string;
};

type Pos = { top: number; left: number };

type Props = {
  rootRef: React.RefObject<HTMLElement | null>;
  /** Open lookup for a word (toolbar / external). */
  openRequest?: { word: string; anchor?: TextAnchor | null; nonce: number } | null;
  onAddNote?: (payload: {
    body: string;
    anchor: TextAnchor | null;
    word: string;
  }) => void | Promise<void>;
};

function formatNoteBody(result: DictResult): string {
  const lines: string[] = [`【${result.query}】`];
  if (result.phonetic) lines.push(result.phonetic);
  for (const s of result.senses.slice(0, 4)) {
    const zh = s.zh ? ` · ${s.zh}` : "";
    lines.push(`${s.pos} ${s.en}${zh}`);
  }
  if (result.note) lines.push(`（${result.note}）`);
  return lines.join("\n");
}

export function DictPopup({ rootRef, openRequest, onAddNote }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 80, left: 80 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DictResult | null>(null);
  const [anchor, setAnchor] = useState<TextAnchor | null>(null);
  const [busyNote, setBusyNote] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastNonce = useRef(0);

  const hide = useCallback(() => {
    setVisible(false);
    setError(null);
    setResult(null);
    setAnchor(null);
    setLoading(false);
  }, []);

  const lookup = useCallback(
    async (word: string, nextAnchor: TextAnchor | null, position: Pos) => {
      const q = word.trim();
      if (!q) return;
      setPos(position);
      setVisible(true);
      setLoading(true);
      setError(null);
      setResult(null);
      setAnchor(nextAnchor);
      try {
        const res = await fetch(
          `/api/dictionary?q=${encodeURIComponent(q)}`,
          { credentials: "same-origin" },
        );
        const data = (await res.json().catch(() => ({}))) as DictResult & {
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "查询失败");
          return;
        }
        setResult(data);
      } catch {
        setError("网络错误");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // External open (toolbar 词典 button)
  useEffect(() => {
    if (!openRequest || openRequest.nonce === lastNonce.current) return;
    lastNonce.current = openRequest.nonce;
    const word = openRequest.word.trim();
    if (!word) return;
    void lookup(word, openRequest.anchor ?? null, {
      top: Math.max(16, window.innerHeight * 0.2),
      left: Math.min(window.innerWidth - 200, Math.max(160, window.innerWidth / 2)),
    });
  }, [openRequest, lookup]);

  // Double-click word in article
  useEffect(() => {
    function onDblClick(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target || !root.contains(target)) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;

      const text = sel.toString().trim();
      if (!text || text.length > 64 || /\s{2,}/.test(text) || text.split(/\s+/).length > 4) {
        return;
      }

      const built = buildAnchorFromSelection(sel, root);
      const rect = range.getBoundingClientRect();
      void lookup(text, built, {
        top: Math.min(window.innerHeight - 40, rect.bottom + 8),
        left: Math.min(
          window.innerWidth - 40,
          Math.max(40, rect.left + rect.width / 2),
        ),
      });
    }

    document.addEventListener("dblclick", onDblClick);
    return () => document.removeEventListener("dblclick", onDblClick);
  }, [rootRef, lookup]);

  // Close on Escape / outside click
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") hide();
    }
    function onDown(e: MouseEvent) {
      const el = panelRef.current;
      if (el && !el.contains(e.target as Node)) {
        hide();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [visible, hide]);

  async function handleAddNote() {
    if (!result || !onAddNote || busyNote) return;
    setBusyNote(true);
    try {
      await onAddNote({
        body: formatNoteBody(result),
        anchor,
        word: result.query,
      });
      hide();
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入笔记失败");
    } finally {
      setBusyNote(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="词典"
      className="fixed z-[60] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {result?.query ?? "查询中…"}
          </p>
          {result?.phonetic && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {result.phonetic}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={hide}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {loading && (
        <p className="py-4 text-center text-sm text-zinc-400">查词中…</p>
      )}

      {error && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {!loading && result && (
        <div className="max-h-64 space-y-2 overflow-auto">
          {result.senses.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {result.note ?? "未找到释义"}
            </p>
          ) : (
            <ul className="space-y-2">
              {result.senses.map((s, i) => (
                <li
                  key={`${s.pos}-${i}`}
                  className="border-t border-zinc-100 pt-2 first:border-0 first:pt-0 dark:border-zinc-800"
                >
                  <span className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {s.pos}
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                    {s.en}
                  </p>
                  {s.zh && (
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                      {s.zh}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.note && result.senses.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {result.note}
            </p>
          )}
        </div>
      )}

      {!loading && result && onAddNote && (
        <div className="mt-3 flex justify-end border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <button
            type="button"
            disabled={busyNote || result.senses.length === 0}
            onClick={() => void handleAddNote()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busyNote ? "保存中…" : "加入笔记"}
          </button>
        </div>
      )}
    </div>
  );
}
