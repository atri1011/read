import { extractTocFromHtml, type TocItem } from "@/lib/md/render";

type ArticlePaneProps = {
  title: string;
  bodyHtml: string;
  showToc?: boolean;
};

function Toc({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="目录"
      className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        目录
      </p>
      <ul className="space-y-1 text-sm">
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
    </nav>
  );
}

export function ArticlePane({
  title,
  bodyHtml,
  showToc = true,
}: ArticlePaneProps) {
  const toc = showToc ? extractTocFromHtml(bodyHtml) : [];

  return (
    <article className="min-w-0 flex-1">
      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
      </header>
      <Toc items={toc} />
      <div
        className="reader-prose max-w-none text-[17px] leading-8 text-zinc-800 dark:text-zinc-100"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  );
}
