# English Reader — Design Doc

> Status: **Frozen MVP** (from `/grill-me`, 2026-07-13)  
> Audience: implementers building the first shippable version

## 1. Product summary

A small-circle **English article reading site** for a VPS shared with classmates.

**Primary value:** elegant reading layout + standard annotations (highlights, notes, export).  
**Secondary value:** light bilingual word lookup + **sentence-pair bilingual reading** (EN source + masked ZH).  
**Signature pipeline:** upload PDF → vision LLM (OpenAI-compatible) → segment/align/translate → pair review → publish to personal shelf (optional public shelf).

Not a vocabulary SRS product, not a real-time collaborative editor.

## 2. Goals and non-goals

### Goals (MVP)

- Email/password accounts
- Personal bookshelf; optional publish to instance-wide public shelf
- Upload **TXT / MD / PDF** (single file)
- TXT/MD → Markdown review; PDF → **vision LLM only** (no OCR)
- Review: sentence-pair editor when segments exist (Markdown fallback otherwise), then publish
- Reader: immersive paper UI; bilingual pairs with blur-masked translation (hover/pin); notes drawer
- Annotations: multi-color highlight, underline, strikethrough, note text; filter in side panel; export own notes as Markdown
- Annotation visibility: default private; optional public; reader defaults to **own only**, toggle to show others’ public notes
- Bilingual popup dictionary (EN↔ZH + EN definition) on selection; “add to note”
- Deploy: Docker Compose (web, worker, postgres, redis) behind host Nginx/Caddy

### Non-goals (MVP)

- OCR fallback
- Epub / Docx / URL clipper / batch upload
- Wordbook, SRS (sentence pairs are for reading study, not flashcards)
- Full-text or semantic search
- Annotation replies, likes, live cursors, OT/CRDT
- Handwriting or PDF pixel-coordinate annotations
- Multi-space/team workspaces, OAuth, Kubernetes
- User quotas / cost dashboards (engineering timeouts/concurrency only)

## 3. Personas and access

| Persona | Needs |
|---------|--------|
| Reader (classmate) | Upload, review layout, read, annotate, optional share, lookup words |
| Admin (you) | Same as reader + configure LLM endpoint, operate VPS |

Open registration (email + password). If the instance is abused later, add invite codes without redesigning core models.

## 4. Core domain concepts

| Concept | Meaning |
|---------|---------|
| **User** | Account; owns documents and annotations |
| **Document** | One uploaded work through processing → review → published readable form |
| **Revision** | Published body snapshot used for reading/annotation anchors (`body_html` / source MD; optional bilingual `segments`) |
| **Segment** | One bilingual unit `{id, source, target, origin}` used for review + interlinear reader |
| **Shelf visibility** | `private` (only owner) or `public` (all logged-in users) |
| **Annotation** | Anchored mark on a revision; `private` or `public` |
| **Parse job** | Async worker unit (especially PDF vision pipeline) |

## 5. Key user flows

### 5.1 Register / login

1. Register with email + password  
2. Login → session cookie (HttpOnly, Secure in prod)  
3. Logout invalidates session  

### 5.2 Upload → review → publish

```
upload → processing → review → published
                      ↘ failed
published → (optional) public shelf
```

1. User uploads single file (txt/md/pdf)  
2. API stores blob, creates `Document` + `ParseJob`  
3. Worker:
   - **txt/md:** decode UTF-8 (fallback detection), normalize to Markdown → `review`  
   - **pdf:** render pages to images → vision LLM (OpenAI-compatible) page-by-page or batched → stitch Markdown → `review`  
4. User opens review UI: Markdown editor + preview (+ PDF page thumbs when source is PDF)  
5. User edits, clicks **Publish** → build `body_html` from MD, set `published`, appears on personal shelf  
6. User may **Publish to public shelf** / **Unpublish from public** (owner only)

### 5.3 Read + annotate

1. Open published doc (own, or public)  
2. Dual pane: content + notes list  
3. Select text → toolbar: highlight colors / underline / strikethrough / add note  
4. Anchors stored against current revision  
5. Toggle “show others’ public annotations”  
6. Export own notes as Markdown download  

### 5.4 Lookup

1. Select word/short phrase  
2. Popup: bilingual gloss (EN-ZH + EN)  
3. Optional “add to note” creates/opens annotation with gloss text  

## 6. State machines

### Document.status

| Status | Meaning |
|--------|---------|
| `uploaded` | File stored, job not started |
| `processing` | Worker running |
| `review` | Awaiting human Markdown confirmation |
| `published` | Readable on shelves |
| `failed` | Terminal until user re-upload or retry |

### ParseJob.status

`queued` → `running` → `succeeded` | `failed`  
Support **retry** from `failed` / partial page failure recorded in job error payload.

### Shelf

Orthogonal flag: `shelf_visibility: private | public` (only meaningful when `status = published`).

## 7. Annotation model

### Anchor strategy

- Annotations attach to a **DocumentRevision** (immutable body used for read).  
- Anchor format (text quote + context, Readability-style):

```ts
type TextAnchor = {
  exact: string;      // selected text
  prefix: string;     // ~32 chars before
  suffix: string;     // ~32 chars after
  // Optional hints for faster resolve:
  blockId?: string;   // data-block-id on paragraph/heading from renderer
  startOffset?: number;
  endOffset?: number;
};
```

- Resolver: prefer `blockId` + offsets; fallback to quote search (`prefix/exact/suffix`).  
- If body is re-published (new revision): attempt re-anchor; on failure mark `orphaned = true` and show “原文已变更”.

### Annotation fields

- `type`: `highlight` | `underline` | `strikethrough` | `note` (note may combine with a mark style)  
- `color`: enum (e.g. yellow/green/blue/pink) for highlights  
- `body`: optional markdown/plain note text  
- `visibility`: `private` | `public`  
- `owner_id`, `document_id`, `revision_id`  

### Export

Export **current user’s** annotations for one document as Markdown:

```markdown
# Notes: {title}

## Highlight — p.context
> quoted text

Note body...
```

## 8. Ingestion / vision pipeline

### Routing

| Source | Path |
|--------|------|
| `.txt`, `.md` | Direct text → normalize MD → `review` |
| `.pdf` | Rasterize pages → vision LLM → MD → `review` |
| Other | Reject |

No OCR path.

### PDF worker steps (Python)

1. Download/open stored PDF from shared volume  
2. Render pages to PNG/WebP (e.g. PyMuPDF) at reading DPI (e.g. 150–200)  
3. For each page (or small batches), call OpenAI-compatible Chat Completions with image parts  
4. Prompt: extract **only article body + translation (译文)**; drop headers/footers/page numbers/ads/UI chrome; restore reading order, headings, lists, blockquotes, code when part of content; describe article figures as `![caption](…)` placeholders; preserve wording faithfully  
5. Stitch pages with clear separators; light cleanup  
6. Write `draft_markdown` on document; status `review`  
7. On API/render errors: set job `failed` with structured error; allow retry  

### LLM config (server-only)

```env
LLM_BASE_URL=https://api.example.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4o
LLM_TIMEOUT_SECONDS=120
```

Adapter interface: `complete_vision(messages) -> str` so providers stay swappable.

### Engineering limits (not product quotas)

- Request timeouts, max retries with backoff  
- Global worker concurrency via `CONCURRENCY` (default 2 PDF/text jobs in one worker process) so VPS remains responsive  
- Reasonable max upload size (e.g. 50MB) to avoid disk/memory blowups — operational safety, not billing  

## 9. Dictionary

- Client selects token → API `GET /api/dictionary?q=`  
- Backend: free remote dictionary API and/or bundled dictionary data  
- Response shape:

```json
{
  "query": "elaborate",
  "phonetic": "/ɪˈlæb.ə.reɪt/",
  "senses": [
    { "pos": "v.", "en": "to explain in more detail", "zh": "详细说明" }
  ]
}
```

- Cache popular queries in Redis or DB  
- Logged-in only  

## 10. Data model (PostgreSQL)

```text
users
  id              uuid PK
  email           citext UNIQUE NOT NULL
  password_hash   text NOT NULL
  name            text
  created_at      timestamptz

sessions
  id              uuid PK
  user_id         uuid FK users
  token_hash      text UNIQUE
  expires_at      timestamptz

documents
  id              uuid PK
  owner_id        uuid FK users
  title           text NOT NULL
  status          text NOT NULL  -- uploaded|processing|review|published|failed
  shelf_visibility text NOT NULL DEFAULT 'private'  -- private|public
  source_mime     text
  source_filename text
  source_path     text           -- relative path on volume
  draft_markdown  text           -- review buffer
  error_message   text
  created_at      timestamptz
  updated_at      timestamptz
  published_at    timestamptz

document_revisions
  id              uuid PK
  document_id     uuid FK documents
  version         int NOT NULL
  markdown        text NOT NULL
  body_html       text NOT NULL
  created_at      timestamptz
  UNIQUE(document_id, version)

parse_jobs
  id              uuid PK
  document_id     uuid FK documents
  status          text NOT NULL  -- queued|running|succeeded|failed
  attempts        int NOT NULL DEFAULT 0
  progress        jsonb          -- e.g. {page, total, stage}
  error           jsonb
  created_at      timestamptz
  started_at      timestamptz
  finished_at     timestamptz

annotations
  id              uuid PK
  document_id     uuid FK documents
  revision_id     uuid FK document_revisions
  owner_id        uuid FK users
  type            text NOT NULL
  color           text
  body            text
  visibility      text NOT NULL DEFAULT 'private'
  anchor          jsonb NOT NULL
  orphaned        boolean NOT NULL DEFAULT false
  created_at      timestamptz
  updated_at      timestamptz

-- optional later: tags, dictionary_cache
```

Indexes:

- `documents(owner_id, status, updated_at desc)`  
- `documents(shelf_visibility, published_at desc)` where public + published  
- `annotations(document_id, owner_id)`  
- `annotations(document_id, visibility)`  

## 11. API sketch (Next.js Route Handlers)

Auth:

- `POST /api/auth/register` `{email,password,name?}`  
- `POST /api/auth/login`  
- `POST /api/auth/logout`  
- `GET  /api/auth/me`  

Documents:

- `GET    /api/documents` — `?scope=mine|public`  
- `POST   /api/documents` — multipart upload  
- `GET    /api/documents/:id`  
- `PATCH  /api/documents/:id` — title, draft_markdown (review), shelf_visibility  
- `POST   /api/documents/:id/publish` — MD → HTML revision  
- `POST   /api/documents/:id/retry` — re-queue parse  
- `GET    /api/documents/:id/jobs/latest`  

Annotations:

- `GET    /api/documents/:id/annotations` — own always; `?include_public=1` adds others’ public  
- `POST   /api/documents/:id/annotations`  
- `PATCH  /api/annotations/:id`  
- `DELETE /api/annotations/:id`  
- `GET    /api/documents/:id/annotations/export` — markdown file  

Dictionary:

- `GET /api/dictionary?q=`  

Authorization rules:

- Read document: owner **or** (`published` && `public`)  
- Mutate document metadata/body: owner  
- Mutate annotation: owner only  

## 12. Frontend IA

```
/login  /register
/app                    → redirect shelf
/app/shelf              → tabs: Mine | Public
/app/docs/:id/review    → MD editor (status=review)
/app/docs/:id/read      → dual-pane reader
/app/settings           → profile; admin LLM smoke test optional
```

UI stack: **Tailwind + shadcn/ui**, typography-focused reader (serif body, adjustable size/measure, dark mode).

Reader chrome (Chinese OK for product UI; article body stays English source).

## 13. Repository layout

```text
/
  DESIGN.md
  docs/superpowers/plans/...
  docker-compose.yml
  .env.example
  apps/
    web/                 # Next.js (TS)
      src/
        app/             # App Router pages + api
        components/
        lib/             # db, auth, md/html, anchors
        styles/
  workers/
    parser/              # Python
      app/
        main.py          # queue consumer
        pdf_render.py
        vision_llm.py
        text_import.py
        md_normalize.py
      pyproject.toml / requirements.txt
  packages/              # optional shared OpenAPI types later
  data/                  # local dev volume (gitignored)
    uploads/
```

## 14. Deployment

```text
[Internet] → Host Caddy/Nginx (TLS) → web:3000
                                  ↘ redis, postgres internal
                                  ↘ worker consumes queue, reads uploads volume
```

Compose services: `web`, `worker`, `db`, `redis`.  
Shared named volume: `uploads`.  
Secrets via `.env` on server (never commit).

Suggested VPS: **≥ 4GB RAM** preferred (PDF rasterization); 2GB possible with low concurrency.

## 15. Security notes

- Password hashing: Argon2id or bcrypt  
- Session tokens: random, hashed at rest  
- Upload: extension + MIME sniff; store outside web root; random object keys  
- SSRF: LLM base URL only from server env, not user input  
- HTML render: Markdown → HTML with sanitizer (e.g. rehype-sanitize)  
- CSRF: same-site cookies + origin checks on mutations  
- Rate-limit auth endpoints lightly  

## 16. Milestone map (see plan for tasks)

| Milestone | Outcome |
|-----------|---------|
| **M0** Scaffold | Compose, Next app, Python worker hello, DB migrate |
| **M1** Auth + shelves | Register/login, empty mine/public lists |
| **M2** Text upload path | TXT/MD → review → publish → read-only view |
| **M3** PDF vision path | PDF job → draft MD → same review/publish |
| **M4** Annotations | Marks, notes, privacy toggle, export |
| **M5** Dictionary + polish | Bilingual popup, dark mode, typography, deploy docs |
| **M6** Hardening | Backup script, basic logging, failure UX |

## 17. Success criteria (MVP done)

- Two users can register, upload a PDF and a TXT, review MD, publish  
- Owner publishes one doc to public; other user can read it  
- Each user annotates privately; public annotations visible only when toggled  
- Export downloads own notes as `.md`  
- Word selection shows bilingual senses  
- `docker compose up` behind host reverse proxy is the documented run path  

## 18. Decision log

| Topic | Choice |
|-------|--------|
| Positioning | Annotation-first, light lookup |
| Sharing | Personal shelf + optional public |
| Collab annotations | Independent; default private; optional public; default hide others |
| Auth | Email + password |
| Annotation depth | Standard reader (B) |
| Ingest | Smart route + mandatory MD review for publish quality |
| Vision | All PDFs via vision LLM; no OCR |
| LLM access | OpenAI-compatible base URL |
| Stack | Next.js + Python worker + Postgres + Redis |
| Cost productization | None |
| Reader chrome | Dual-pane flexible |
| Lookup | Popup bilingual, no wordbook |
| Deploy | Compose + host reverse proxy |
| Search | None in MVP |
| Formats | TXT/MD/PDF single-file |
