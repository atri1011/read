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
import {
  ArticlePane,
  type BilingualMode,
} from "@/components/reader/article-pane";
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
import {
  computeScrollRatio,
  loadReaderProgress,
  ratioToScrollTop,
  saveReaderProgress,
} from "@/lib/reader/progress";
import {
  applyFindMarks,
  clearFindMarks,
  normalizeFindQuery,
  scrollToFindMatch,
} from "@/lib/reader/find-in-page";

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
  bilingualMode: BilingualMode;
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
  bilingualMode: "bilingual",
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
    const bilingualMode: BilingualMode =
      parsed.bilingualMode === "source" ? "source" : "bilingual";
    return { fontSize, measure, bilingualMode };
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

function BilingualModeControls({
  prefs,
  updatePrefs,
  enabled,
}: {
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
  enabled: boolean;
}) {
  if (!enabled) return null;
  const active =
    "rounded bg-zinc-800 px-2 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900";
  const idle =
    "rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-600 hover:bg-black/5 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-white/10";

  return (
    <>
      <span className="ml-2 text-zinc-500">阅读</span>
      <button
        type="button"
        className={prefs.bilingualMode === "bilingual" ? active : idle}
        onClick={() => updatePrefs({ bilingualMode: "bilingual" })}
      >
        对照
      </button>
      <button
        type="button"
        className={prefs.bilingualMode === "source" ? active : idle}
        onClick={() => updatePrefs({ bilingualMode: "source" })}
      >
        原文
      </button>
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
  const [progressRatio, setProgressRatio] = useState(0);
  const restoredProgressRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState(0);
  const [findIndex, setFindIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

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

  // Restore last reading position for this document (ratio-based).
  useEffect(() => {
    restoredProgressRef.current = false;
    setProgressRatio(0);
    const scroller = scrollRef.current;
    if (!scroller) return;

    let cancelled = false;
    let attempts = 0;

    const tryRestore = () => {
      if (cancelled || restoredProgressRef.current) return;
      const saved = loadReaderProgress(documentId);
      if (!saved || saved.ratio <= 0.01) {
        restoredProgressRef.current = true;
        setProgressRatio(saved?.ratio ?? 0);
        return;
      }

      const max = scroller.scrollHeight - scroller.clientHeight;
      // Wait until content has real height (fonts / images / bilingual layout).
      if (max <= 40 && attempts < 24) {
        attempts += 1;
        window.setTimeout(tryRestore, 50);
        return;
      }

      scroller.scrollTop = ratioToScrollTop(
        saved.ratio,
        scroller.scrollHeight,
        scroller.clientHeight,
      );
      setProgressRatio(saved.ratio);
      restoredProgressRef.current = true;
    };

    // Next frame so ArticlePane has painted bodyHtml.
    const id = window.requestAnimationFrame(() => tryRestore());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [documentId, bodyHtml]);

  // Track scroll progress + persist (throttled).
  // Wait until restore finishes so we never overwrite saved progress with 0.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let cancelled = false;
    let attached = false;

    const persist = (ratio: number, immediate = false) => {
      setProgressRatio(ratio);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (immediate) {
        saveReaderProgress(documentId, ratio);
        return;
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveReaderProgress(documentId, ratio);
        saveTimerRef.current = null;
      }, 180);
    };

    const onScroll = () => {
      if (!restoredProgressRef.current) return;
      const ratio = computeScrollRatio(
        scroller.scrollTop,
        scroller.scrollHeight,
        scroller.clientHeight,
      );
      persist(ratio);
    };

    const attachWhenReady = () => {
      if (cancelled || attached) return;
      if (!restoredProgressRef.current) {
        window.setTimeout(attachWhenReady, 40);
        return;
      }
      attached = true;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };

    attachWhenReady();

    return () => {
      cancelled = true;
      scroller.removeEventListener("scroll", onScroll);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Flush only if restore already applied; otherwise leave prior value.
      if (restoredProgressRef.current) {
        const ratio = computeScrollRatio(
          scroller.scrollTop,
          scroller.scrollHeight,
          scroller.clientHeight,
        );
        persist(ratio, true);
      }
    };
  }, [documentId, bodyHtml]);

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

  function handleSelect(id: string, opts?: { openNotes?: boolean }) {
    setActiveId(id);
    if (opts?.openNotes) setNotesOpen(true);
    const root = articleRef.current;
    if (root) {
      // Marks may re-render with active styles; defer scroll slightly.
      window.requestAnimationFrame(() => {
        scrollToAnnotation(root, id);
      });
    }
  }

  function handleSelectFromMark(id: string) {
    handleSelect(id, { openNotes: true });
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
  const hasBilingual = useMemo(
    () => bodyHtml.includes("bilingual-pair"),
    [bodyHtml],
  );


  // In-article find: re-apply after annotations redraw.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const q = normalizeFindQuery(findQuery);
    if (!findOpen || !q) {
      clearFindMarks(root);
      setFindCount(0);
      return;
    }
    const count = applyFindMarks(root, q, findIndex);
    setFindCount(count);
    if (count === 0) return;
    const safeIndex = ((findIndex % count) + count) % count;
    if (safeIndex !== findIndex) {
      setFindIndex(safeIndex);
      return;
    }
    window.requestAnimationFrame(() => {
      scrollToFindMatch(root, safeIndex);
    });
  }, [findOpen, findQuery, findIndex, annotations, bodyHtml, activeId]);

  function closeFind() {
    setFindOpen(false);
    setFindQuery("");
    setFindCount(0);
    setFindIndex(0);
    const root = articleRef.current;
    if (root) clearFindMarks(root);
  }

  function openFind() {
    setFindOpen(true);
    setHotZoneOpen(true);
    window.setTimeout(() => findInputRef.current?.focus(), 0);
  }

  function stepFind(delta: number) {
    if (findCount <= 0) return;
    setFindIndex((idx) => {
      const next = (idx + delta) % findCount;
      return next < 0 ? next + findCount : next;
    });
  }


  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (findOpen) {
          e.preventDefault();
          closeFind();
          return;
        }
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
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openFind();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNotesOpen((v) => !v);
        return;
      }
      if (e.key === "t" || e.key === "T") {
        if (tocItems.length === 0) return;
        e.preventDefault();
        setHotZoneOpen(true);
        setTocOpen((v) => !v);
        return;
      }
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        setPrefs((prev) => {
          const idx = FONT_STEPS.indexOf(
            prev.fontSize as (typeof FONT_STEPS)[number],
          );
          const nextIdx =
            e.key === "["
              ? Math.max(0, idx === -1 ? 0 : idx - 1)
              : Math.min(
                  FONT_STEPS.length - 1,
                  idx === -1 ? FONT_STEPS.length - 1 : idx + 1,
                );
          const next = {
            ...prev,
            fontSize: FONT_STEPS[nextIdx] ?? prev.fontSize,
          };
          try {
            localStorage.setItem("reader:prefs", JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        setHotZoneOpen(true);
        return;
      }
      if ((e.key === "b" || e.key === "B") && hasBilingual) {
        e.preventDefault();
        setPrefs((prev) => {
          const next = {
            ...prev,
            bilingualMode:
              prev.bilingualMode === "bilingual"
                ? ("source" as const)
                : ("bilingual" as const),
          };
          try {
            localStorage.setItem("reader:prefs", JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        setHotZoneOpen(true);
        return;
      }

      const scroller = scrollRef.current;
      if (!scroller) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const delta = Math.max(240, scroller.clientHeight * 0.9);
        scroller.scrollBy({
          top: e.shiftKey ? -delta : delta,
          behavior: "smooth",
        });
        return;
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        scroller.scrollBy({ top: 80, behavior: "smooth" });
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        scroller.scrollBy({ top: -80, behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen, tocOpen, hotZoneOpen, tocItems.length, hasBilingual, findOpen, findCount]);

  return (
    <div className="reader-page-root reader-immersive flex min-h-0 flex-1 flex-col">
      <div
        className="reader-progress"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressRatio * 100)}
      >
        <div
          className="reader-progress-bar"
          style={{ width: `${Math.round(progressRatio * 1000) / 10}%` }}
        />
      </div>
      {findOpen && (
        <div className="fixed left-1/2 top-3 z-50 flex w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--reader-muted)_28%,transparent)] bg-[color:var(--reader-surface)]/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                stepFind(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeFind();
              }
            }}
            placeholder="在文中查找…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--reader-fg)] outline-none placeholder:text-[color:var(--reader-muted)]"
            aria-label="在文中查找"
          />
          <span className="shrink-0 tabular-nums text-xs text-[color:var(--reader-muted)]">
            {normalizeFindQuery(findQuery)
              ? findCount > 0
                ? `${findIndex + 1}/${findCount}`
                : "0/0"
              : "—"}
          </span>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-xs text-[color:var(--reader-muted)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => stepFind(-1)}
            disabled={findCount <= 0}
            aria-label="上一个匹配"
          >
            ↑
          </button>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-xs text-[color:var(--reader-muted)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => stepFind(1)}
            disabled={findCount <= 0}
            aria-label="下一个匹配"
          >
            ↓
          </button>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-xs text-[color:var(--reader-muted)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={closeFind}
            aria-label="关闭查找"
          >
            ✕
          </button>
        </div>
      )}
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
            <span className="tabular-nums text-zinc-500">
              {Math.round(progressRatio * 100)}%
            </span>
            <FontMeasureControls prefs={prefs} updatePrefs={updatePrefs} />
            <BilingualModeControls
              prefs={prefs}
              updatePrefs={updatePrefs}
              enabled={hasBilingual}
            />
            <ReaderTocMenu
              items={tocItems}
              open={tocOpen}
              onOpenChange={setTocOpen}
            />
            <button
              type="button"
              onClick={openFind}
              className="rounded border border-zinc-300/80 px-2 py-0.5 text-xs text-zinc-700 hover:bg-black/5 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-white/10"
              title="在文中查找 (Ctrl/Cmd+F)"
            >
              查找
            </button>
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
              bilingualMode={prefs.bilingualMode}
            />
            <AnnotationLayer
              rootRef={articleRef}
              annotations={annotations}
              currentUserId={currentUserId}
              activeId={activeId}
              onSelect={handleSelectFromMark}
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
          onUpdated={(row) => {
            setAnnotations((prev) =>
              prev.map((a) => (a.id === row.id ? row : a)),
            );
          }}
          activeId={activeId}
          loading={loading}
          open={notesOpen}
          onOpenChange={setNotesOpen}
        />
      </div>
    </div>
  );
}
