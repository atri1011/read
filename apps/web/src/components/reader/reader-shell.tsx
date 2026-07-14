"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArticlePane } from "@/components/reader/article-pane";
import { AnnotationLayer, scrollToAnnotation } from "@/components/reader/annotation-layer";
import { DictPopup } from "@/components/reader/dict-popup";
import { NotesPane } from "@/components/reader/notes-pane";
import {
  SelectionToolbar,
  type DictRequest,
  type ToolbarAction,
} from "@/components/reader/selection-toolbar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  createAnnotation,
  fetchAnnotations,
  type AnnotationDto,
} from "@/lib/annotations/client";
import type { TextAnchor } from "@/lib/annotations/anchor";
import { extractTocFromHtml, type TocItem } from "@/lib/md/render";

type Props = {
  documentId: string;
  title: string;
  bodyHtml: string;
  currentUserId: string;
  /** Owner-only actions (edit, visibility) shown in the top hot-zone. */
  ownerActions?: ReactNode;
};

type ReaderPrefs = {
  fontSize: number;
  measure: "narrow" | "normal" | "wide";
};

const FONT_STEPS = [15, 17, 19, 21, 23] as const;
const MEASURE_CLASS: Record<ReaderPrefs["measure"], string> = {
  narrow: "max-w-xl",
  normal: "max-w-3xl",
  wide: "max-w-5xl",
};

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 17,
  measure: "normal",
};

function loadPrefs(): ReaderPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem("reader:prefs");
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    const fontSize = FONT_STEPS.includes(parsed.fontSize as (typeof FONT_STEPS)[number])
      ? (parsed.fontSize as number)
      : DEFAULT_PREFS.fontSize;
    const measure =
      parsed.measure === "narrow" ||
      parsed.measure === "normal" ||
      parsed.measure === "wide"
        ? parsed.measure
        : DEFAULT_PREFS.measure;
    return { fontSize, measure };
  } catch {
    return DEFAULT_PREFS;
  }
}

function FontMeasureControls({
  prefs,
  updatePrefs,
}: {
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
}) {
  const btn =
    "rounded border border-zinc-300/80 px-2 py-0.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-white/10";
  const activeMeasure =
    "rounded bg-zinc-800 px-2 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900";
  const idleMeasure =
    "rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-600 hover:bg-black/5 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-white/10";

  return (
    <>
      <span className="text-zinc-500">字号</span>
      <button
        type="button"
        aria-label="减小字号"
        className={btn}
        disabled={prefs.fontSize <= FONT_STEPS[0]!}
        onClick={() => {
          const idx = FONT_STEPS.indexOf(
            prefs.fontSize as (typeof FONT_STEPS)[number],
          );
          const next = FONT_STEPS[Math.max(0, idx - 1)] ?? prefs.fontSize;
          updatePrefs({ fontSize: next });
        }}
      >
        A−
      </button>
      <button
        type="button"
        aria-label="增大字号"
        className={btn}
        disabled={prefs.fontSize >= FONT_STEPS[FONT_STEPS.length - 1]!}
        onClick={() => {
          const idx = FONT_STEPS.indexOf(
            prefs.fontSize as (typeof FONT_STEPS)[number],
          );
          const next =
            FONT_STEPS[Math.min(FONT_STEPS.length - 1, idx + 1)] ??
            prefs.fontSize;
          updatePrefs({ fontSize: next });
        }}
      >
        A+
      </button>
      <span className="ml-2 text-zinc-500">版心</span>
      {(
        [
          { id: "narrow", label: "窄" },
          { id: "normal", label: "中" },
          { id: "wide", label: "宽" },
        ] as const
      ).map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => updatePrefs({ measure: m.id })}
          className={prefs.measure === m.id ? activeMeasure : idleMeasure}
        >
          {m.label}
        </button>
      ))}
    </>
  );
}

function ReaderTocMenu({
  items,
  open,
  onOpenChange,
}: {
  items: TocItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-700 hover:bg-black/5 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        目录
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="关闭目录"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => onOpenChange(false)}
          />
          <ul className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-auto rounded-lg border border-zinc-200 bg-white/95 p-2 text-sm shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
            {items.map((item) => (
              <li
                key={item.id}
                style={{ paddingLeft: `${Math.max(0, item.level - 1) * 0.75}rem` }}
              >
                <a
                  href={`#${item.id}`}
                  onClick={() => onOpenChange(false)}
                  className="block rounded px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ReaderShell({
  documentId,
  title,
  bodyHtml,
  currentUserId,
  ownerActions,
}: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<AnnotationDto[]>([]);
  const [includePublic, setIncludePublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dictOpen, setDictOpen] = useState<{
    word: string;
    anchor?: TextAnchor | null;
    nonce: number;
  } | null>(null);
  const [prefillNote, setPrefillNote] = useState<{
    body: string;
    nonce: number;
  } | null>(null);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [hotZoneOpen, setHotZoneOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("immersive-reading");
    return () => {
      root.classList.remove("immersive-reading");
    };
  }, []);

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("reader:prefs", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (notesOpen) {
        e.preventDefault();
        setNotesOpen(false);
        return;
      }
      if (tocOpen) {
        e.preventDefault();
        setTocOpen(false);
        return;
      }
      if (hotZoneOpen) {
        e.preventDefault();
        setHotZoneOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen, tocOpen, hotZoneOpen]);

  const reload = useCallback(
    async (withPublic: boolean) => {
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await fetchAnnotations(documentId, withPublic);
        setAnnotations(rows);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "加载批注失败");
      } finally {
        setLoading(false);
      }
    },
    [documentId],
  );

  useEffect(() => {
    void reload(includePublic);
  }, [reload, includePublic]);

  async function handleAnnotate(action: ToolbarAction) {
    const created = await createAnnotation(documentId, {
      type: action.type,
      color: action.color ?? null,
      body: action.body ?? null,
      visibility: action.visibility,
      anchor: action.anchor,
    });
    setAnnotations((prev) => [created, ...prev]);
    setActiveId(created.id);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    const root = articleRef.current;
    if (root) scrollToAnnotation(root, id);
  }

  function handleDeleted(id: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function handleDictionary(req: DictRequest) {
    setDictOpen({
      word: req.word,
      anchor: req.anchor,
      nonce: Date.now(),
    });
  }

  async function handleDictAddNote(payload: {
    body: string;
    anchor: TextAnchor | null;
    word: string;
  }) {
    if (payload.anchor) {
      const created = await createAnnotation(documentId, {
        type: "note",
        color: "yellow",
        body: payload.body,
        visibility: "private",
        anchor: payload.anchor,
      });
      setAnnotations((prev) => [created, ...prev]);
      setActiveId(created.id);
      return;
    }
    setPrefillNote({ body: payload.body, nonce: Date.now() });
  }

  const measureClass = MEASURE_CLASS[prefs.measure];
  const tocItems = useMemo(() => extractTocFromHtml(bodyHtml), [bodyHtml]);

  return (
    <div className="reader-page-root reader-immersive flex min-h-0 flex-1 flex-col">
      <Link
        href="/app/shelf"
        aria-label="返回书架"
        className="fixed left-3 top-3 z-30 inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--reader-muted)_28%,transparent)] bg-[color:var(--reader-surface)]/90 px-3 py-1.5 text-sm text-[color:var(--reader-muted)] shadow-sm backdrop-blur transition hover:text-[color:var(--reader-fg)] sm:left-4 sm:top-4"
      >
        <span aria-hidden>←</span>
        书架
      </Link>

      <div
        className="fixed inset-x-0 top-0 z-40"
        onMouseEnter={() => setHotZoneOpen(true)}
        onMouseLeave={() => {
          if (!tocOpen) setHotZoneOpen(false);
        }}
      >
        {/* Always-on hit target at the top edge (hover or click) */}
        <div
          className="h-3 w-full cursor-default"
          aria-hidden
          onClick={() => setHotZoneOpen((v) => !v)}
        />
        {hotZoneOpen && (
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 rounded-b-xl border border-zinc-200/80 border-t-0 bg-[color:var(--reader-surface)]/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-zinc-700/80">
            <FontMeasureControls prefs={prefs} updatePrefs={updatePrefs} />
            <ReaderTocMenu
              items={tocItems}
              open={tocOpen}
              onOpenChange={setTocOpen}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ThemeToggle className="border-zinc-300/80 px-2 py-0.5 text-xs dark:border-zinc-600" />
              {ownerActions}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="reader-immersive-scroll min-w-0 flex-1 overflow-auto px-4 pb-8 pt-14 sm:px-8 lg:px-12"
        >
          <div className={`mx-auto ${measureClass}`}>
            {loadError && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {loadError}
              </p>
            )}
            <ArticlePane
              ref={articleRef}
              title={title}
              bodyHtml={bodyHtml}
              fontSize={prefs.fontSize}
            />
            <AnnotationLayer
              rootRef={articleRef}
              annotations={annotations}
              currentUserId={currentUserId}
              activeId={activeId}
            />
            <SelectionToolbar
              rootRef={articleRef}
              onAnnotate={handleAnnotate}
              onDictionary={handleDictionary}
              prefillNote={prefillNote}
            />
            <DictPopup
              rootRef={articleRef}
              openRequest={dictOpen}
              onAddNote={handleDictAddNote}
            />
          </div>
        </div>

        <NotesPane
          documentId={documentId}
          currentUserId={currentUserId}
          annotations={annotations}
          includePublic={includePublic}
          onIncludePublicChange={setIncludePublic}
          onSelect={handleSelect}
          onDeleted={handleDeleted}
          activeId={activeId}
          loading={loading}
          open={notesOpen}
          onOpenChange={setNotesOpen}
        />
      </div>
    </div>
  );
}
