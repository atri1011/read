# Immersive Reader — Design Spec

> Status: **Superseded** — reading is always paper/immersive; dual-mode (精读/沉浸) removed.  
> Audience: implementers (historical)

## 1. Summary

Add an explicit **精读 / 沉浸** reading mode so long-form English articles can feel novel-like (focus chrome + book typography) without removing annotation or dictionary tools.

## 2. Goals / non-goals

### Goals (v1)

- Explicit toggle: study (default) ↔ immersive; remember in `localStorage`
- Immersive hides: app shell header, doc top bar, font/measure strip, side notes pane, in-article sticky TOC
- Immersive keeps: title, body, selection toolbar, dictionary popup
- On-demand: top hover hot-zone toolbar; notes as drawer; Esc exits immersive
- Typography: system serif stack, warmer paper / soft night backgrounds following global light/dark
- Shared `fontSize` + `measure` across modes
- Desktop-first; mobile must not break

### Non-goals (v1)

- Pagination / page-flip animation
- Progress bar or cross-session scroll restore
- `requestFullscreen`
- Separate multi “reading themes” matrix
- Mobile gesture polish
- Server-synced reader prefs
- Disabling annotations in immersive

## 3. Preferences

```ts
type ReaderPrefs = {
  fontSize: number;
  measure: "narrow" | "normal" | "wide";
  immersive: boolean; // default false
};
// localStorage key: "reader:prefs"
```

## 4. Interaction

| Action | Behavior |
|--------|----------|
| Enter | “沉浸” control in study toolbar |
| Exit | “退出沉浸” in hot-zone toolbar, or `Esc` |
| Hot zone | Hover (or focus) top edge → thin toolbar: A−/A+, measure, TOC (if any), exit |
| Notes | Right-edge / FAB opens side drawer; does not exit immersive |
| Selection tools | Unchanged in both modes |
| Mode switch | Preserve scroll position in the article scroller |
| Theme | Global ThemeToggle; immersive supplies paper tokens per light/dark |

## 5. Visual tokens (immersive)

| | Light | Dark |
|--|-------|------|
| Background | `#f7f3ea` | `#141210` |
| Text | `#2c2416` | `#e8e0d4` |
| Muted | `#6b5e4e` | `#a39889` |
| Font | system serif stack | same |
| Line-height | ~1.8 | ~1.8 |

Annotations: slightly lower highlight opacity on paper so marks feel less fluorescent.

## 6. UI structure

### Study (current, plus toggle)

```
[app header]
[doc bar: shelf / title / edit / visibility]
[font + measure + 沉浸]
[ article | notes side pane ]
```

### Immersive

```
[ full-height book page ]
[ invisible top hot-zone → toolbar ]
[ article only ]
[ notes FAB → drawer ]
```

`html.immersive-reading` hides `.app-shell-header`.

## 7. File touch list

- `apps/web/src/components/reader/reader-shell.tsx`
- `apps/web/src/components/reader/article-pane.tsx`
- `apps/web/src/components/reader/notes-pane.tsx`
- `apps/web/src/app/app/docs/[id]/read/page.tsx`
- `apps/web/src/app/app/layout.tsx`
- `apps/web/src/app/globals.css`

## 8. Acceptance

1. Fresh load: study mode, notes side pane on desktop.
2. Click 沉浸: chrome gone, serif + paper color, title remains, TOC hidden.
3. Hover top: toolbar appears; can change font/measure; exit works.
4. Esc exits immersive; scroll position retained.
5. Select text: annotate + dictionary still work.
6. Open notes drawer, select a note, jump to mark; still immersive.
7. Theme toggle: paper tokens flip with light/dark.
8. Reload: immersive preference restored.
