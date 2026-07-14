"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type BilingualMode = "bilingual" | "source";

type ArticlePaneProps = {
  title: string;
  bodyHtml: string;
  fontSize?: number;
  bilingualMode?: BilingualMode;
};

export const ArticlePane = forwardRef<HTMLDivElement, ArticlePaneProps>(
  function ArticlePane(
    { title, bodyHtml, fontSize = 17, bilingualMode = "bilingual" },
    ref,
  ) {
    const localRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

    // Click-to-pin translation lines
    useEffect(() => {
      const root = localRef.current;
      if (!root) return;

      function onClick(e: MouseEvent) {
        const el = (e.target as HTMLElement | null)?.closest?.(
          ".bilingual-target",
        ) as HTMLElement | null;
        if (!el || !root?.contains(el)) return;
        const pinned = el.getAttribute("data-pinned") === "true";
        if (pinned) {
          el.removeAttribute("data-pinned");
        } else {
          el.setAttribute("data-pinned", "true");
        }
      }

      function onKey(e: KeyboardEvent) {
        if (e.key !== "Enter" && e.key !== " ") return;
        const el = e.target as HTMLElement | null;
        if (!el?.classList.contains("bilingual-target")) return;
        e.preventDefault();
        const pinned = el.getAttribute("data-pinned") === "true";
        if (pinned) el.removeAttribute("data-pinned");
        else el.setAttribute("data-pinned", "true");
      }

      root.querySelectorAll<HTMLElement>(".bilingual-target").forEach((node) => {
        if (!node.hasAttribute("tabindex")) {
          node.setAttribute("tabindex", "0");
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", "显示或固定译文");
        }
      });

      root.addEventListener("click", onClick);
      root.addEventListener("keydown", onKey);
      return () => {
        root.removeEventListener("click", onClick);
        root.removeEventListener("keydown", onKey);
      };
    }, [bodyHtml]);

    return (
      <article className="min-w-0 flex-1">
        <header className="reader-immersive-title mb-10 pb-2">
          <h1 className="text-3xl font-medium tracking-wide text-[color:var(--reader-fg)] sm:text-4xl">
            {title}
          </h1>
        </header>
        <div
          ref={localRef}
          className="reader-prose reader-prose-immersive max-w-none leading-[1.8] text-[color:var(--reader-fg)]"
          style={{ fontSize: `${fontSize}px` }}
          data-bilingual-mode={bilingualMode}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>
    );
  },
);
