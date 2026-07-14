"use client";

import { forwardRef } from "react";

type ArticlePaneProps = {
  title: string;
  bodyHtml: string;
  fontSize?: number;
};

export const ArticlePane = forwardRef<HTMLDivElement, ArticlePaneProps>(
  function ArticlePane({ title, bodyHtml, fontSize = 17 }, ref) {
    return (
      <article className="min-w-0 flex-1">
        <header className="reader-immersive-title mb-10 pb-2">
          <h1 className="text-3xl font-medium tracking-wide text-[color:var(--reader-fg)] sm:text-4xl">
            {title}
          </h1>
        </header>
        <div
          ref={ref}
          className="reader-prose reader-prose-immersive max-w-none leading-[1.8] text-[color:var(--reader-fg)]"
          style={{ fontSize: `${fontSize}px` }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>
    );
  },
);
