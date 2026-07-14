"use client";

import { useMemo, useState } from "react";
import type { AnnotationDto } from "@/lib/annotations/client";
import { deleteAnnotation, exportAnnotationsUrl } from "@/lib/annotations/client";

type NotesPaneProps = {
  documentId: string;
  currentUserId: string;
  annotations: AnnotationDto[];
  includePublic: boolean;
  onIncludePublicChange: (value: boolean) => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  activeId?: string | null;
  loading?: boolean;
  className?: string;
  /** When true, always use drawer (e.g. immersive mode on desktop). */
  forceDrawer?: boolean;
};

const TYPE_FILTERS = [
  { id: "all", label: "全部" },
  { id: "highlight", label: "高亮" },
  { id: "underline", label: "下划线" },
  { id: "strikethrough", label: "删除线" },
  { id: "note", label: "笔记" },
] as const;

const COLOR_FILTERS = [
  { id: "all", label: "全部颜色" },
  { id: "yellow", label: "黄" },
  { id: "green", label: "绿" },
  { id: "blue", label: "蓝" },
  { id: "pink", label: "粉" },
] as const;

function typeLabel(type: string): string {
  switch (type) {
    case "highlight":
      return "高亮";
    case "underline":
      return "下划线";
    case "strikethrough":
      return "删除线";
    case "note":
      return "笔记";
    default:
      return type;
  }
}

function colorDot(color: string | null): string {
  switch (color) {
    case "green":
      return "bg-green-300";
    case "blue":
      return "bg-blue-300";
    case "pink":
      return "bg-pink-300";
    case "yellow":
      return "bg-yellow-300";
    default:
      return "bg-zinc-200";
  }
}

function NotesList({
  documentId,
  currentUserId,
  annotations,
  includePublic,
  onIncludePublicChange,
  onSelect,
  onDeleted,
  activeId,
  loading,
}: Omit<NotesPaneProps, "className">) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return annotations.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (colorFilter !== "all" && a.color !== colorFilter) return false;
      return true;
    });
  }, [annotations, typeFilter, colorFilter]);

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteAnnotation(id);
      onDeleted(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            笔记
          </h2>
          <a
            href={exportAnnotationsUrl(documentId)}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            导出
          </a>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={includePublic}
            onChange={(e) => onIncludePublicChange(e.target.checked)}
            className="rounded border-zinc-300"
          />
          显示他人公开批注
        </label>

        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                typeFilter === f.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {COLOR_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setColorFilter(f.id)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                colorFilter === f.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {loading && (
          <p className="px-2 py-8 text-center text-sm text-zinc-400">加载中…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-zinc-400">
            暂无笔记 · 选中正文文字即可标注
          </p>
        )}
        <ul className="space-y-1">
          {filtered.map((a) => {
            const isOwn = a.ownerId === currentUserId;
            const exact =
              typeof a.anchor?.exact === "string" ? a.anchor.exact : "";
            return (
              <li key={a.id}>
                <div
                  className={`group rounded-lg border px-3 py-2 text-left transition ${
                    activeId === a.id
                      ? "border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-900"
                      : "border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/60"
                  } ${!isOwn ? "border-dashed border-zinc-300 dark:border-zinc-700" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className="w-full text-left"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${colorDot(a.color)}`}
                      />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        {typeLabel(a.type)}
                      </span>
                      {!isOwn && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                          他人 · 公开
                        </span>
                      )}
                      {a.visibility === "public" && isOwn && (
                        <span className="text-[10px] text-zinc-400">公开</span>
                      )}
                      {a.orphaned && (
                        <span className="text-[10px] text-amber-600">
                          原文已变更
                        </span>
                      )}
                    </div>
                    {exact && (
                      <p className="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-100">
                        “{exact}”
                      </p>
                    )}
                    {a.body && (
                      <p className="mt-1 line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400">
                        {a.body}
                      </p>
                    )}
                  </button>
                  {isOwn && (
                    <div className="mt-1 flex justify-end opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        disabled={deletingId === a.id}
                        onClick={() => handleDelete(a.id)}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function NotesPane(props: NotesPaneProps) {
  const [open, setOpen] = useState(false);
  const { className = "", forceDrawer = false, ...listProps } = props;
  const useDrawer = forceDrawer;

  return (
    <>
      {/* Desktop side pane (hidden when forceDrawer / immersive) */}
      {!useDrawer && (
        <aside
          className={`hidden w-full max-w-sm shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex ${className}`}
        >
          <NotesList {...listProps} />
        </aside>
      )}

      {/* Mobile drawer — or desktop drawer when immersive */}
      <div className={useDrawer ? "" : "lg:hidden"}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-30 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          笔记
          {props.annotations.length > 0
            ? ` (${props.annotations.length})`
            : ""}
        </button>
        {open && (
          <div
            className={`fixed inset-0 z-40 flex ${
              useDrawer
                ? "flex-row justify-end"
                : "flex-col justify-end"
            }`}
          >
            <button
              type="button"
              aria-label="关闭笔记"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div
              className={`relative z-10 flex flex-col overflow-hidden border bg-white dark:border-zinc-800 dark:bg-zinc-950 ${
                useDrawer
                  ? "h-full w-full max-w-sm border-l border-zinc-200 shadow-xl"
                  : "max-h-[75vh] rounded-t-2xl border-zinc-200"
              }`}
            >
              <div className="flex items-center justify-end border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  关闭
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <NotesList
                  {...listProps}
                  onSelect={(id) => {
                    listProps.onSelect(id);
                    setOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
