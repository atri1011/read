"use client";

import { forwardRef, useMemo, useState } from "react";
import { extractTocFromHtml, type TocItem } from "@/lib/md/render";

type ArticlePaneProps = {
  title: string;
  bodyHtml: string;
  showToc?: boolean;
  fontSize?: number;
};

function Toc({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="目录"
      className="sticky top-2 z-10 mb-8 rounded-xl border border-zinc-200 bg-zinc-50/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          目录
        </p>
        <span className="text-xs text-zinc-400">{open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              style={{ paddingLeft: `${Math.max(0, item.level - 1) * 0.75}rem` }}
            >
              <a
                href={`#${item.id}`}
                className="text-zinc-700 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

export const ArticlePane = forwardRef<HTMLDivElement, ArticlePaneProps>(
  function ArticlePane(
    { title, bodyHtml, showToc = true, fontSize = 17 },
    ref,
  ) {
    const toc = useMemo(
      () => (showToc ? extractTocFromHtml(bodyHtml) : []),
      [bodyHtml, showToc],
    );

    return (
      <article className="min-w-0 flex-1">
        <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
        </header>
        <Toc items={toc} />
        <div
          ref={ref}
          className="reader-prose max-w-none leading-8 text-zinc-800 dark:text-zinc-100"
          style={{ fontSize: `${fontSize}px` }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>
    );
  },
);
