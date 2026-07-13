# English Reader MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a VPS-friendly English reading site: upload TXT/MD/PDF, vision-LLM PDF parse, Markdown review, personal/public shelves, standard annotations, bilingual lookup.

**Architecture:** Next.js (App Router) owns HTTP, auth, UI, and DB writes. Python worker consumes Redis-backed jobs, rasterizes PDFs, calls OpenAI-compatible vision API, writes draft Markdown. PostgreSQL is source of truth; uploads live on a shared Docker volume. Host Nginx/Caddy terminates TLS.

**Tech Stack:** Next.js 15 + TypeScript + Tailwind + shadcn/ui + Drizzle ORM + PostgreSQL + Redis (BullMQ or arq) + Python 3.12 + PyMuPDF + httpx + Docker Compose

**Spec:** [`DESIGN.md`](../../../DESIGN.md)

---

## File map (create during M0–M5)

```text
docker-compose.yml
.env.example
.gitignore
README.md
apps/web/package.json
apps/web/drizzle.config.ts
apps/web/src/lib/db/schema.ts
apps/web/src/lib/db/index.ts
apps/web/src/lib/auth/password.ts
apps/web/src/lib/auth/session.ts
apps/web/src/lib/md/render.ts
apps/web/src/lib/annotations/anchor.ts
apps/web/src/lib/queue.ts
apps/web/src/app/api/**/route.ts
apps/web/src/app/**/page.tsx
apps/web/src/components/**/*.tsx
workers/parser/pyproject.toml
workers/parser/app/main.py
workers/parser/app/settings.py
workers/parser/app/db.py
workers/parser/app/pdf_render.py
workers/parser/app/vision_llm.py
workers/parser/app/text_import.py
workers/parser/app/jobs.py
workers/parser/tests/**
```

---

## Phase M0 — Scaffold

### Task 0.1: Repo + Compose skeleton

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Add `.gitignore`**

```gitignore
node_modules/
.next/
dist/
.env
.env.local
data/
__pycache__/
.venv/
*.pyc
.DS_Store
```

- [ ] **Step 2: Add `.env.example`**

```env
POSTGRES_USER=reader
POSTGRES_PASSWORD=reader
POSTGRES_DB=reader
DATABASE_URL=postgresql://reader:reader@db:5432/reader
REDIS_URL=redis://redis:6379/0
SESSION_SECRET=change-me-to-long-random
UPLOAD_DIR=/data/uploads
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Add `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    env_file: .env
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: ./workers/parser
      dockerfile: Dockerfile
    env_file: .env
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
  uploads:
```

- [ ] **Step 4: Write short `README.md`** with: copy `.env.example` → `.env`, `docker compose up --build`, host reverse-proxy notes pointing to DESIGN.md.

- [ ] **Step 5: Commit**

```bash
git init
git add .gitignore .env.example docker-compose.yml README.md DESIGN.md docs
git commit -m "chore: scaffold compose, env, design docs"
```

---

### Task 0.2: Next.js app skeleton

**Files:**
- Create: `apps/web/*` (create-next-app)

- [ ] **Step 1: Scaffold app**

```bash
cd apps
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack
```

- [ ] **Step 2: Install server deps**

```bash
cd apps/web
npm install drizzle-orm postgres bcryptjs zod nanoid
npm install -D drizzle-kit @types/bcryptjs
npm install bullmq ioredis
npm install unified remark-parse remark-rehype rehype-stringify rehype-sanitize rehype-slug
```

- [ ] **Step 3: Add `apps/web/Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Ensure `next.config.ts` has `output: "standalone"`.

- [ ] **Step 4: Dev sanity check**

```bash
cd apps/web && npm run dev
```

Expected: home page on `http://localhost:3000`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "chore: add Next.js web app skeleton"
```

---

### Task 0.3: Database schema + Drizzle

**Files:**
- Create: `apps/web/src/lib/db/schema.ts`
- Create: `apps/web/src/lib/db/index.ts`
- Create: `apps/web/drizzle.config.ts`

- [ ] **Step 1: Write schema** (`apps/web/src/lib/db/schema.ts`)

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull(), // uploaded|processing|review|published|failed
    shelfVisibility: text("shelf_visibility").notNull().default("private"),
    sourceMime: text("source_mime"),
    sourceFilename: text("source_filename"),
    sourcePath: text("source_path"),
    draftMarkdown: text("draft_markdown"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_owner_updated_idx").on(t.ownerId, t.updatedAt),
    index("documents_public_idx").on(t.shelfVisibility, t.publishedAt),
  ],
);

export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    markdown: text("markdown").notNull(),
    bodyHtml: text("body_html").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("doc_rev_unique").on(t.documentId, t.version)],
);

export const parseJobs = pgTable("parse_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // queued|running|succeeded|failed
  attempts: integer("attempts").notNull().default(0),
  progress: jsonb("progress"),
  error: jsonb("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => documentRevisions.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    color: text("color"),
    body: text("body"),
    visibility: text("visibility").notNull().default("private"),
    anchor: jsonb("anchor").notNull(),
    orphaned: boolean("orphaned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("annotations_doc_owner_idx").on(t.documentId, t.ownerId),
    index("annotations_doc_vis_idx").on(t.documentId, t.visibility),
  ],
);
```

- [ ] **Step 2: DB client** (`apps/web/src/lib/db/index.ts`)

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Generate + push schema**

```bash
# start only db
docker compose up -d db
cd apps/web
export DATABASE_URL=postgresql://reader:reader@localhost:5432/reader
npx drizzle-kit generate
npx drizzle-kit migrate
# or drizzle-kit push for early dev
```

Expected: tables exist in Postgres.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/db apps/web/drizzle.config.ts apps/web/drizzle
git commit -m "feat(db): add drizzle schema for users docs jobs annotations"
```

---

### Task 0.4: Python worker skeleton

**Files:**
- Create: `workers/parser/pyproject.toml` or `requirements.txt`
- Create: `workers/parser/Dockerfile`
- Create: `workers/parser/app/settings.py`
- Create: `workers/parser/app/main.py`

- [ ] **Step 1: Dependencies** (`requirements.txt`)

```text
httpx==0.28.1
pymupdf==1.25.3
psycopg[binary]==3.2.4
redis==5.2.1
pydantic-settings==2.7.1
python-multipart==0.0.20
```

- [ ] **Step 2: Settings**

```python
# workers/parser/app/settings.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    upload_dir: str = "/data/uploads"
    llm_base_url: str
    llm_api_key: str
    llm_model: str = "gpt-4o"
    llm_timeout_seconds: int = 120
    queue_name: str = "parse_jobs"
    concurrency: int = 1

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
```

- [ ] **Step 3: Hello consumer** (`main.py`)

```python
# workers/parser/app/main.py
import time
from app.settings import settings

def main() -> None:
    print("parser worker starting", settings.queue_name, flush=True)
    while True:
        # replaced in M2/M3 with BRPOP/arq/bullmq bridge
        time.sleep(5)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["python", "-m", "app.main"]
```

- [ ] **Step 5: Commit**

```bash
git add workers/parser
git commit -m "chore: add python parser worker skeleton"
```

---

## Phase M1 — Auth + empty shelves

### Task 1.1: Password + session helpers

**Files:**
- Create: `apps/web/src/lib/auth/password.ts`
- Create: `apps/web/src/lib/auth/session.ts`
- Create: `apps/web/src/lib/auth/current-user.ts`

- [ ] **Step 1: Password helpers**

```ts
// apps/web/src/lib/auth/password.ts
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 2: Session cookie helpers**

```ts
// apps/web/src/lib/auth/session.ts
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

const COOKIE = "reader_session";
const DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DAYS * 864e5);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.userId ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth
git commit -m "feat(auth): password hashing and session cookies"
```

---

### Task 1.2: Auth API + pages

**Files:**
- Create: `apps/web/src/app/api/auth/register/route.ts`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/middleware.ts` (protect `/app/*`)

- [ ] **Step 1: Register route** — validate email/password with zod (password min 8); reject duplicate email 409; `hashPassword` + insert user + `createSession`; return `{user}`.

- [ ] **Step 2: Login route** — lookup by email; `verifyPassword`; `createSession`; 401 on failure (same message for unknown user).

- [ ] **Step 3: Logout + me routes** — destroy session; me returns user or 401.

- [ ] **Step 4: Simple login/register forms** — client components posting JSON to APIs; redirect `/app/shelf`.

- [ ] **Step 5: Middleware** — if path starts with `/app` and no session cookie, redirect `/login`.

- [ ] **Step 6: Manual test**

```bash
# register two users via UI or curl
curl -c c.jar -H 'content-type: application/json' \
  -d '{"email":"a@test.com","password":"password1","name":"A"}' \
  http://localhost:3000/api/auth/register
curl -b c.jar http://localhost:3000/api/auth/me
```

Expected: 200 with user payload.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app apps/web/src/middleware.ts
git commit -m "feat(auth): register login logout and shelf gate"
```

---

### Task 1.3: Shelf list UI + API

**Files:**
- Create: `apps/web/src/app/api/documents/route.ts` (GET)
- Create: `apps/web/src/app/app/shelf/page.tsx`
- Create: `apps/web/src/components/shelf/document-list.tsx`

- [ ] **Step 1: GET `/api/documents?scope=mine|public`**
  - `mine`: `ownerId = me`, order `updatedAt desc`
  - `public`: `status=published` AND `shelfVisibility=public`, order `publishedAt desc`
  - Never return `draftMarkdown` for non-owners

- [ ] **Step 2: Shelf page** with tabs Mine / Public; empty states in Chinese UI copy.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/documents apps/web/src/app/app/shelf apps/web/src/components/shelf
git commit -m "feat(shelf): mine and public document lists"
```

---

## Phase M2 — TXT/MD upload → review → publish → read

### Task 2.1: Upload API + storage

**Files:**
- Create: `apps/web/src/lib/storage.ts`
- Create: `apps/web/src/app/api/documents/route.ts` (POST multipart)
- Create: `apps/web/src/lib/queue.ts`

- [ ] **Step 1: Storage helper**

```ts
// apps/web/src/lib/storage.ts
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export function uploadRoot(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "../../data/uploads");
}

export async function saveUpload(
  relDir: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const safe = filename.replace(/[^\w.\-()+ ]+/g, "_");
  const key = path.join(relDir, `${randomBytes(8).toString("hex")}_${safe}`);
  const full = path.join(uploadRoot(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key.replace(/\\/g, "/");
}
```

- [ ] **Step 2: POST upload**
  - Accept single file; allow mime/ext: `text/plain` `.txt`, `text/markdown` `.md`, `application/pdf` `.pdf`
  - Max 50MB
  - Create `documents` row `status=uploaded`, title from filename stem
  - Create `parse_jobs` `queued`
  - Enqueue job id on Redis list `parse_jobs` (JSON `{jobId, documentId}`)
  - Set document `status=processing`

- [ ] **Step 3: Queue helper** using `ioredis` `lpush`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/storage.ts apps/web/src/lib/queue.ts apps/web/src/app/api/documents
git commit -m "feat(upload): store file create document and enqueue parse job"
```

---

### Task 2.2: Worker text import path

**Files:**
- Create: `workers/parser/app/db.py`
- Create: `workers/parser/app/text_import.py`
- Create: `workers/parser/app/jobs.py`
- Modify: `workers/parser/app/main.py`

- [ ] **Step 1: DB helpers with psycopg** — fetch job+document; update statuses; set `draft_markdown`.

- [ ] **Step 2: `text_import.py`**

```python
from pathlib import Path

def load_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")

def to_markdown(text: str, filename: str) -> str:
    name = filename.lower()
    body = text.replace("\r\n", "\n").strip() + "\n"
    if name.endswith(".md"):
        return body
    # plain txt: keep paragraphs
    return body
```

- [ ] **Step 3: Job runner** — BRPOP `parse_jobs`; if source ends with txt/md: import → `documents.status=review`, job `succeeded`; else leave for M3 or mark failed temporarily with message `unsupported pending pdf`.

- [ ] **Step 4: Integration test manually** — upload txt via API; worker logs success; DB draft filled.

- [ ] **Step 5: Commit**

```bash
git add workers/parser
git commit -m "feat(worker): text and markdown import to review state"
```

---

### Task 2.3: Review editor + publish

**Files:**
- Create: `apps/web/src/lib/md/render.ts`
- Create: `apps/web/src/app/api/documents/[id]/route.ts`
- Create: `apps/web/src/app/api/documents/[id]/publish/route.ts`
- Create: `apps/web/src/app/app/docs/[id]/review/page.tsx`
- Create: `apps/web/src/components/review/markdown-editor.tsx`

- [ ] **Step 1: Markdown → sanitized HTML**

```ts
// apps/web/src/lib/md/render.ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

export async function markdownToHtml(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}
```

Also wrap block elements with `data-block-id` in a small rehype plugin or post-process for annotation anchors (required before M4).

- [ ] **Step 2: PATCH document** — owner only; update `title`, `draftMarkdown` when status is `review` or `published` (editing published creates path to re-publish).

- [ ] **Step 3: POST publish** — owner; require draft; `markdownToHtml`; insert next `document_revisions` version; set `status=published`, `publishedAt=now()`; keep `shelfVisibility` as-is (default private).

- [ ] **Step 4: Review page** — textarea or CodeMirror/MD editor + preview; Save + Publish buttons; poll job status if still processing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/md apps/web/src/app/api/documents apps/web/src/app/app/docs apps/web/src/components/review
git commit -m "feat(review): markdown editor and publish revision"
```

---

### Task 2.4: Read-only reader shell + public toggle

**Files:**
- Create: `apps/web/src/app/app/docs/[id]/read/page.tsx`
- Create: `apps/web/src/components/reader/article-pane.tsx`
- Create: `apps/web/src/components/reader/notes-pane.tsx` (empty list OK)
- Modify: PATCH for `shelfVisibility`

- [ ] **Step 1: Read page** loads latest revision HTML; dual pane layout (article ~65%, notes collapsible); mobile notes drawer.

- [ ] **Step 2: Owner control “发布到公共书架 / 撤回”** sets `shelf_visibility`.

- [ ] **Step 3: AuthZ** — non-owner can open only if published+public.

- [ ] **Step 4: Typography** — prose classes, font-size controls in localStorage, dark mode via `next-themes` or class on `html`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app/docs apps/web/src/components/reader
git commit -m "feat(reader): dual-pane read view and public shelf toggle"
```

---

## Phase M3 — PDF vision pipeline

### Task 3.1: PDF rasterization

**Files:**
- Create: `workers/parser/app/pdf_render.py`
- Create: `workers/parser/tests/test_pdf_render.py`

- [ ] **Step 1: Implement render**

```python
# workers/parser/app/pdf_render.py
from pathlib import Path
import fitz  # PyMuPDF

def render_pdf_pages(pdf_path: Path, out_dir: Path, dpi: int = 160) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    paths: list[Path] = []
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        p = out_dir / f"page-{i+1:04d}.png"
        pix.save(p.as_posix())
        paths.append(p)
    doc.close()
    return paths
```

- [ ] **Step 2: Unit test with a tiny fixture PDF** (commit a 1-page sample under `workers/parser/tests/fixtures/sample.pdf`).

```bash
cd workers/parser && pytest tests/test_pdf_render.py -v
```

- [ ] **Step 3: Commit**

```bash
git add workers/parser/app/pdf_render.py workers/parser/tests
git commit -m "feat(worker): render pdf pages to png"
```

---

### Task 3.2: Vision LLM client

**Files:**
- Create: `workers/parser/app/vision_llm.py`

- [ ] **Step 1: OpenAI-compatible vision call**

```python
# workers/parser/app/vision_llm.py
import base64
from pathlib import Path
import httpx
from app.settings import settings

SYSTEM = """You restore English reading material from page images into clean Markdown.
Preserve wording. Use #/## headings, lists, blockquotes, code fences when appropriate.
For figures, emit a short Markdown image placeholder with a descriptive caption.
Output Markdown only."""

async def page_to_markdown(image_path: Path, page_index: int, page_total: int) -> str:
    b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Page {page_index}/{page_total}. Convert this page to Markdown.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            },
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"]
```

- [ ] **Step 2: Wire PDF branch in `jobs.py`** — render → loop pages → update `progress` jsonb → stitch with `\n\n---\n\n` → save draft → `review`.

- [ ] **Step 3: Failure handling** — catch HTTP errors; set job failed + document failed/error_message; keep partial draft if useful.

- [ ] **Step 4: Manual test** with real `LLM_*` env on a short PDF.

- [ ] **Step 5: Commit**

```bash
git add workers/parser/app/vision_llm.py workers/parser/app/jobs.py
git commit -m "feat(worker): vision llm pdf to markdown pipeline"
```

---

### Task 3.3: Retry + processing UI

**Files:**
- Create: `apps/web/src/app/api/documents/[id]/retry/route.ts`
- Create: `apps/web/src/app/api/documents/[id]/jobs/latest/route.ts`
- Modify: review page polling

- [ ] **Step 1: retry** re-queues when status `failed` (owner).
- [ ] **Step 2: job status endpoint** for progress bar (`page/total`).
- [ ] **Step 3: UI states** processing / failed / review.
- [ ] **Step 4: Commit** `feat(upload): retry parse and progress polling`

---

## Phase M4 — Annotations

### Task 4.1: Anchor utilities

**Files:**
- Create: `apps/web/src/lib/annotations/anchor.ts`
- Create: `apps/web/src/lib/annotations/anchor.test.ts`

- [ ] **Step 1: Implement create/resolve**

```ts
export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
};

export function buildAnchorFromSelection(
  sel: Selection,
  root: HTMLElement,
): TextAnchor | null {
  // walk to text nodes; compute exact/prefix/suffix; find nearest [data-block-id]
  // return null if collapsed or outside root
}

export function resolveAnchor(root: HTMLElement, anchor: TextAnchor): Range | null {
  // 1) blockId + offsets if present
  // 2) fallback: search text content for prefix+exact+suffix
}
```

- [ ] **Step 2: Unit tests** with JSDOM fixture HTML containing `data-block-id`.

- [ ] **Step 3: Commit** `feat(annotations): text quote anchor build and resolve`

---

### Task 4.2: Annotations API

**Files:**
- Create: `apps/web/src/app/api/documents/[id]/annotations/route.ts`
- Create: `apps/web/src/app/api/annotations/[id]/route.ts`
- Create: `apps/web/src/app/api/documents/[id]/annotations/export/route.ts`

- [ ] **Step 1: GET** — always owner’s annotations; if `include_public=1`, union others where `visibility=public` on same document (readable docs only).

- [ ] **Step 2: POST** — body zod: type, color?, body?, visibility, anchor; bind to latest revision; owner = me.

- [ ] **Step 3: PATCH/DELETE** — owner only.

- [ ] **Step 4: Export** — markdown download of **my** annotations only.

- [ ] **Step 5: Commit** `feat(annotations): crud and markdown export api`

---

### Task 4.3: Reader annotation UX

**Files:**
- Create: `apps/web/src/components/reader/selection-toolbar.tsx`
- Create: `apps/web/src/components/reader/annotation-layer.tsx`
- Modify: `article-pane.tsx`, `notes-pane.tsx`

- [ ] **Step 1: On mouseup selection** show toolbar: colors, underline, strike, note, visibility private/public.

- [ ] **Step 2: Render marks** via DOM ranges + CSS classes (`bg-yellow-200/50`, underline, line-through); distinguish own vs others (e.g. dashed outline for others).

- [ ] **Step 3: Notes pane** lists annotations; filter by type/color; click scrolls to anchor.

- [ ] **Step 4: Toggle** “显示他人公开批注” refetches with `include_public=1`.

- [ ] **Step 5: Export button** downloads file.

- [ ] **Step 6: Manual E2E** two browsers/users on one public doc.

- [ ] **Step 7: Commit** `feat(reader): highlight notes toolbar and side list`

---

## Phase M5 — Dictionary + polish + deploy docs

### Task 5.1: Dictionary API + popup

**Files:**
- Create: `apps/web/src/lib/dictionary/lookup.ts`
- Create: `apps/web/src/app/api/dictionary/route.ts`
- Create: `apps/web/src/components/reader/dict-popup.tsx`

- [ ] **Step 1: `lookup.ts`** — normalize query (letters only, max 64 chars); call a free dictionary source (e.g. Free Dictionary API for EN) + a ZH gloss source or bilingual dataset; map to `{query, phonetic, senses:[{pos,en,zh}]}`; cache in Redis `dict:{q}` TTL 7d.

- [ ] **Step 2: GET `/api/dictionary?q=`** requires session; 400 if empty.

- [ ] **Step 3: Popup** on word double-click or small “词典” action from selection toolbar; button “加入笔记” prefills annotation body.

- [ ] **Step 4: Commit** `feat(dict): bilingual lookup popup`

---

### Task 5.2: UI polish

**Files:**
- Modify: layout, theme provider, reader typography controls
- Create: upload dropzone component on shelf

- [ ] **Step 1: shadcn components** — button, tabs, dialog, dropdown, textarea, toast, sheet (mobile notes).

- [ ] **Step 2: Dark mode + font size / measure controls.

- [ ] **Step 3: TOC** from revision headings (`h1–h3`) sticky collapse.

- [ ] **Step 4: Commit** `feat(ui): theme typography toc and upload dropzone`

---

### Task 5.3: Deploy documentation

**Files:**
- Modify: `README.md`
- Create: `docs/deploy-vps.md`

- [ ] **Step 1: Document** host Caddy/Nginx example reverse proxy to `127.0.0.1:3000`; `docker compose up -d`; volume backup (`pg_dump` + `uploads`).

- [ ] **Step 2: Example Caddyfile**

```caddy
reader.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

- [ ] **Step 3: Commit** `docs: vps reverse proxy and backup notes`

---

## Phase M6 — Hardening (still MVP-adjacent)

### Task 6.1: Safety passes

- [ ] Auth rate limit (in-memory or Redis) on login/register: e.g. 20/10min/IP  
- [ ] HTML sanitization review on publish  
- [ ] Ensure LLM key never sent to client  
- [ ] Orphan annotations when re-publish: run resolve; set `orphaned`  
- [ ] Structured logging for worker failures  
- [ ] Commit `fix: hardening auth rate limit and republish anchors`

---

## Dependency graph

```text
M0 scaffold
 └─ M1 auth + shelf
     └─ M2 text path + reader shell
         ├─ M3 pdf vision
         └─ M4 annotations (needs reader HTML + block ids)
             └─ M5 dictionary + polish
                 └─ M6 hardening
```

M3 and M4 can partially parallelize after M2.4 (read page exists), but annotation anchors need stable `body_html` with `data-block-id` from publish.

---

## Spec coverage checklist

| DESIGN requirement | Tasks |
|--------------------|-------|
| Email/password auth | 1.1–1.2 |
| Personal + public shelf | 1.3, 2.4 |
| TXT/MD/PDF single upload | 2.1, 3.x |
| Vision LLM PDF, no OCR | 3.1–3.2 |
| OpenAI-compatible config | 3.2, `.env` |
| MD review then publish | 2.3 |
| Dual-pane reader | 2.4, 4.3 |
| Standard annotations + export | 4.1–4.3 |
| Default own notes; toggle others’ public | 4.2–4.3 |
| Bilingual dictionary popup | 5.1 |
| Compose + host reverse proxy | 0.1, 5.3 |
| No search / no OCR / no wordbook | omitted by design |

---

## Self-review notes

- Types aligned: document statuses and annotation visibility strings match DESIGN.md.  
- No OCR tasks included.  
- Worker and web share `UPLOAD_DIR` volume and `DATABASE_URL`.  
- Cost quotas intentionally absent; only 50MB upload cap and worker concurrency.  
- Dictionary provider concrete mapping may swap implementation inside `lookup.ts` without API changes.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-english-reader-mvp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
