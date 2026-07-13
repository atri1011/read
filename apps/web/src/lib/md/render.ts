import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
]);

const DENY_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
]);

/**
 * Tight allowlist on top of rehype-sanitize defaults:
 * - no script/style/iframe/object/embed/form (and no event handlers: on*)
 * - only safe URL protocols on href/src
 * - permit data-block-id for annotation anchors (camelCase in HAST)
 */
const baseAttrs = defaultSchema.attributes ?? {};
const starAttrs = [...(baseAttrs["*"] ?? [])];
const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => !DENY_TAGS.has(tag)),
  attributes: {
    ...baseAttrs,
    a: [...(baseAttrs.a ?? [])],
    img: [...(baseAttrs.img ?? [])],
    code: [...(baseAttrs.code ?? []), "className"],
    "*": [
      ...starAttrs,
      // hast-util-sanitize uses camelCase for data-* properties
      "dataBlockId",
      "id",
      "className",
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  // Prefix clobbering ids that could shadow DOM APIs
  clobberPrefix: "user-content-",
};

/**
 * Assign order-based data-block-id attributes for annotation anchors (M4).
 */
const rehypeBlockIds: Plugin<[], Root> = () => {
  return (tree: Root) => {
    let i = 0;
    visit(tree, "element", (node: Element) => {
      if (!BLOCK_TAGS.has(node.tagName)) return;
      node.properties = node.properties || {};
      node.properties.dataBlockId = `b-${i}`;
      i += 1;
    });
  };
};

export async function markdownToHtml(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeBlockIds)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

export type TocItem = {
  id: string;
  text: string;
  level: number;
};

/** Lightweight heading extraction for optional TOC (from HTML with ids). */
export function extractTocFromHtml(html: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const level = Number(m[1]);
    const attrs = m[2] || "";
    const inner = m[3] || "";
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const id = idMatch?.[1] ?? "";
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (id && text) items.push({ id, text, level });
  }
  return items;
}

