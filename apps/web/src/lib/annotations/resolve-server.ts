import type { TextAnchor } from "@/lib/annotations/anchor";

/**
 * Server-side re-resolution of text anchors against a new revision body.
 * MVP strategy: if the exact quote (whitespace-normalized) still appears in
 * markdown or HTML plain text, keep the annotation; otherwise mark orphaned.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function quotePresent(haystack: string, exact: string): boolean {
  if (!exact) return false;
  if (haystack.includes(exact)) return true;
  const nHay = normalizeWs(haystack);
  const nExact = normalizeWs(exact);
  if (!nExact) return false;
  return nHay.includes(nExact);
}

export function isAnchorResolvable(
  anchor: unknown,
  markdown: string,
  bodyHtml: string,
): boolean {
  if (!anchor || typeof anchor !== "object") return false;
  const exact = (anchor as TextAnchor).exact;
  if (typeof exact !== "string" || !exact) return false;

  if (quotePresent(markdown, exact)) return true;
  if (quotePresent(stripHtml(bodyHtml), exact)) return true;
  return false;
}
