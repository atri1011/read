# Bilingual Sentence-Pair Reader Design

**Date:** 2026-07-14  
**Status:** Approved for implementation

## Problem

After LLM scan, content is free-form Markdown and renders as a single language stream. Readers want interlinear bilingual study: one English sentence, one Chinese translation, with translations masked by default.

## Goals

1. Prefer translations already present in the source (e.g. bilingual PDF extract); LLM fills gaps EN→ZH.
2. Default reading mode is bilingual; user can switch to source-only.
3. Translation lines use blur mask; hover reveals temporarily; click pins.
4. Review stage allows editing sentence pairs.
5. Annotations attach to English source only.
6. Legacy documents without segments keep current HTML behavior.

## Non-goals (v1)

- ZH→EN or multi-language pairs
- Side-by-side dual column
- Word-level alignment
- Forced backfill of historical documents
- Global “reveal all translations” control

## Architecture

```
Upload → parse draft_markdown
       → segment + align + translate
       → draft_segments (authoritative for bilingual)
       → review pair editor
       → publish: body_html (bilingual structure) + markdown (source-derived)
       → reader: blur / hover / pin / mode toggle
```

### Segment model

```ts
type BilingualSegment = {
  id: string; // "s-0"
  source: string;
  target: string; // may be empty
  origin: "extracted" | "generated" | "edited";
};

type DraftSegmentsPayload = {
  version: 1;
  segments: BilingualSegment[];
};
```

Stored on `documents.draft_segments` and snapshotted to `document_revisions.segments` on publish.

### HTML contract

```html
<div class="bilingual-pair" data-segment-id="s-0">
  <p class="bilingual-source" data-block-id="b-0">English…</p>
  <p class="bilingual-target" data-masked="true">中文…</p>
</div>
```

- `data-block-id` lives on **source** so annotation offsets never include translation.
- Empty `target` → omit target node.

### Derived markdown

When segments are authoritative, `draft_markdown` / revision `markdown` are derived by joining `source` with `\n\n` for export and re-anchor stability.

## Worker pipeline

After existing PDF vision / text import produces markdown:

1. `stage: segment` — split blocks/sentences; align extracted ZH via heuristics (`## Translation` / `## 译文`, CJK ratio, adjacent EN/ZH, equal-count zip).
2. `stage: translate` — batch LLM fill for empty targets; fail-soft.
3. `set_document_review(markdown, draft_segments)`.

## Review

When `draft_segments` present: pair editor is primary. Save/publish send segments; server derives markdown.

## Reader

- Default `bilingualMode: "bilingual"` in `reader:prefs`.
- CSS blur on `[data-masked="true"]`; hover + `[data-pinned="true"]` clear blur.
- Source-only mode hides `.bilingual-target`.
- Selection in `.bilingual-target` does not open annotation toolbar.

## Failure modes

- Translate failure → still enter review with partial/empty targets.
- No segments → legacy markdown editor + markdownToHtml path.
