"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArticlePane } from "@/components/reader/article-pane";
import { AnnotationLayer, scrollToAnnotation } from "@/components/reader/annotation-layer";
import { NotesPane } from "@/components/reader/notes-pane";
import {
  SelectionToolbar,
  type ToolbarAction,
} from "@/components/reader/selection-toolbar";
import {
  createAnnotation,
  fetchAnnotations,
  type AnnotationDto,
} from "@/lib/annotations/client";

type Props = {
  documentId: string;
  title: string;
  bodyHtml: string;
  currentUserId: string;
};

export function ReaderShell({
  documentId,
  title,
  bodyHtml,
  currentUserId,
}: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<AnnotationDto[]>([]);
  const [includePublic, setIncludePublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          {loadError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {loadError}
            </p>
          )}
          <ArticlePane ref={articleRef} title={title} bodyHtml={bodyHtml} />
          <AnnotationLayer
            rootRef={articleRef}
            annotations={annotations}
            currentUserId={currentUserId}
            activeId={activeId}
          />
          <SelectionToolbar
            rootRef={articleRef}
            onAnnotate={handleAnnotate}
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
      />
    </div>
  );
}
