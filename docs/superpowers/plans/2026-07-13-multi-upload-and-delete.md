# Multi-upload & Bookshelf Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload multiple TXT/MD/PDF files in one shelf action (stay on shelf with progress/summary) and hard-delete owned documents from the personal shelf with confirmation.

**Architecture:** Keep single-file `POST /api/documents`. Add a small client helper that uploads a `FileList` with concurrency 2. Add owner-only `DELETE /api/documents/[id]` that deletes the DB row (cascade) and best-effort unlinks `sourcePath`. Wire shelf UI: multi on dropzone, delete button on mine list only.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Drizzle ORM, existing shelf components under `apps/web/src/components/shelf/`.

**Spec:** [`docs/superpowers/specs/2026-07-13-multi-upload-and-delete-design.md`](../specs/2026-07-13-multi-upload-and-delete-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/storage.ts` | Add `deleteUpload(relativeKey)` |
| `apps/web/src/lib/storage.test.ts` | Unit tests for delete helper |
| `apps/web/src/lib/documents/upload-client.ts` | Shared client: single + multi upload with concurrency |
| `apps/web/src/lib/documents/upload-client.test.ts` | Unit tests for concurrency + result mapping |
| `apps/web/src/app/api/documents/[id]/route.ts` | Add `DELETE` handler |
| `apps/web/src/components/shelf/upload-dropzone.tsx` | Multi-file select/drop, progress, summary, no redirect |
| `apps/web/src/components/shelf/upload-button.tsx` | Same multi behavior (consistency; currently unused) |
| `apps/web/src/components/shelf/document-list.tsx` | Optional delete control + confirm |
| `apps/web/src/components/shelf/shelf-tabs.tsx` | Wire `onUploaded` reload + delete handler |

No DB migration. No new dependencies.

---

### Task 1: Storage delete helper

**Files:**
- Modify: `apps/web/src/lib/storage.ts`
- Create: `apps/web/src/lib/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/storage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "fs/promises";
import path from "path";
import os from "os";
import { deleteUpload, resolveUploadPath, saveUpload } from "./storage";

describe("deleteUpload", () => {
  let tmp: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "reader-upload-"));
    prev = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = tmp;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prev;
    await rm(tmp, { recursive: true, force: true });
  });

  it("removes a file written by saveUpload", async () => {
    const key = await saveUpload("user1", "a.pdf", Buffer.from("%PDF-1.4"));
    const full = resolveUploadPath(key);
    await expect(readFile(full)).resolves.toBeInstanceOf(Buffer);

    await deleteUpload(key);

    await expect(readFile(full)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is a no-op when the file is already missing", async () => {
    await expect(deleteUpload("user1/missing_file.pdf")).resolves.toBeUndefined();
  });

  it("rejects path traversal keys that escape upload root", async () => {
    await expect(deleteUpload("../outside.txt")).rejects.toThrow(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm test -- src/lib/storage.test.ts
```

Expected: FAIL — `deleteUpload` is not exported / not a function.

- [ ] **Step 3: Implement `deleteUpload`**

Append to `apps/web/src/lib/storage.ts`:

```ts
import { mkdir, writeFile, unlink } from "fs/promises";
// (merge with existing import from "fs/promises")

export async function deleteUpload(relativeKey: string): Promise<void> {
  if (!relativeKey || relativeKey.includes("\0")) {
    throw new Error("invalid upload key");
  }
  // Normalize and block escaping the upload root
  const root = path.resolve(uploadRoot());
  const full = path.resolve(root, relativeKey);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("invalid upload key");
  }

  try {
    await unlink(full);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
}
```

Ensure top-of-file imports include `unlink`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && npm test -- src/lib/storage.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/storage.ts apps/web/src/lib/storage.test.ts
git commit -m "feat(storage): add safe deleteUpload helper"
```

---

### Task 2: Client multi-upload helper

**Files:**
- Create: `apps/web/src/lib/documents/upload-client.ts`
- Create: `apps/web/src/lib/documents/upload-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/documents/upload-client.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  mapWithConcurrency,
  uploadDocumentFile,
  uploadDocuments,
} from "./upload-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mapWithConcurrency", () => {
  it("limits parallel work and preserves order", async () => {
    let live = 0;
    let maxLive = 0;
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      await new Promise((r) => setTimeout(r, 20));
      live -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(maxLive).toBeLessThanOrEqual(2);
  });
});

describe("uploadDocumentFile", () => {
  it("returns id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ id: "doc-1", title: "a" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const file = new File(["hi"], "a.txt", { type: "text/plain" });
    const result = await uploadDocumentFile(file);
    expect(result).toEqual({
      ok: true,
      file,
      id: "doc-1",
      title: "a",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "文件不能超过 50MB" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const file = new File(["x"], "big.pdf", { type: "application/pdf" });
    const result = await uploadDocumentFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("文件不能超过 50MB");
    }
  });
});

describe("uploadDocuments", () => {
  it("reports progress and aggregates results", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 2) {
          return new Response(JSON.stringify({ error: "失败" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ id: `doc-${call}`, title: `t${call}` }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" }),
      new File(["c"], "c.txt", { type: "text/plain" }),
    ];
    const progress: Array<[number, number]> = [];
    const results = await uploadDocuments(files, {
      concurrency: 1,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(progress.at(-1)).toEqual([3, 3]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/web && npm test -- src/lib/documents/upload-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

Create `apps/web/src/lib/documents/upload-client.ts`:

```ts
export type UploadSuccess = {
  ok: true;
  file: File;
  id: string;
  title?: string;
};

export type UploadFailure = {
  ok: false;
  file: File;
  error: string;
};

export type UploadResult = UploadSuccess | UploadFailure;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]!, i);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    run(),
  );
  await Promise.all(runners);
  return results;
}

export async function uploadDocumentFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.set("file", file);
  try {
    const res = await fetch("/api/documents", {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      documentId?: string;
      title?: string;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, file, error: data.error ?? "上传失败" };
    }
    const id = data.id ?? data.documentId;
    if (!id) {
      return { ok: false, file, error: "上传成功但未返回文档 id" };
    }
    return { ok: true, file, id, title: data.title };
  } catch {
    return { ok: false, file, error: "网络错误" };
  }
}

export type UploadDocumentsOptions = {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

export async function uploadDocuments(
  files: readonly File[],
  options: UploadDocumentsOptions = {},
): Promise<UploadResult[]> {
  const list = files.filter((f) => f && f.size >= 0);
  const total = list.length;
  if (total === 0) return [];

  let done = 0;
  options.onProgress?.(0, total);

  return mapWithConcurrency(list, options.concurrency ?? 2, async (file) => {
    const result = await uploadDocumentFile(file);
    done += 1;
    options.onProgress?.(done, total);
    return result;
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && npm test -- src/lib/documents/upload-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/documents/upload-client.ts apps/web/src/lib/documents/upload-client.test.ts
git commit -m "feat(documents): client multi-upload helper with concurrency"
```

---

### Task 3: DELETE `/api/documents/[id]`

**Files:**
- Modify: `apps/web/src/app/api/documents/[id]/route.ts`
- Modify: `apps/web/src/lib/storage.ts` (already has `deleteUpload`)

- [ ] **Step 1: Add DELETE handler**

In `apps/web/src/app/api/documents/[id]/route.ts`:

1. Import `deleteUpload` from `@/lib/storage`.
2. Import remains for `db`, `documents`, access helpers.
3. Append:

```ts
export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (!isOwner(doc, user)) {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  const sourcePath = doc.sourcePath;

  try {
    await db.delete(documents).where(eq(documents.id, doc.id));
  } catch (err) {
    console.error("document delete failed", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }

  if (sourcePath) {
    try {
      await deleteUpload(sourcePath);
    } catch (err) {
      console.error("upload file cleanup failed", sourcePath, err);
    }
  }

  return new NextResponse(null, { status: 204 });
}
```

Full imports at top of file should look like:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  canReadPublished,
  getDocumentById,
  getLatestRevision,
  isOwner,
} from "@/lib/documents/access";
import { deleteUpload } from "@/lib/storage";
```

- [ ] **Step 2: Typecheck / lint the route**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors related to the new handler.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/documents/[id]/route.ts
git commit -m "feat(api): owner hard-delete document with file cleanup"
```

---

### Task 4: Multi-file `UploadDropzone`

**Files:**
- Modify: `apps/web/src/components/shelf/upload-dropzone.tsx`
- Modify: `apps/web/src/components/shelf/shelf-tabs.tsx` (minimal: accept `onUploaded` prop on dropzone first)

- [ ] **Step 1: Rewrite dropzone to use multi helper**

Replace `apps/web/src/components/shelf/upload-dropzone.tsx` with:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import {
  uploadDocuments,
  type UploadFailure,
} from "@/lib/documents/upload-client";

const ACCEPT =
  ".txt,.md,.pdf,text/plain,text/markdown,application/pdf";

type UploadDropzoneProps = {
  onUploaded?: () => void;
};

export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => f && f.size > 0);
      if (files.length === 0) return;

      setPending(true);
      setError(null);
      setFailures([]);
      setSuccessCount(null);
      setProgress({ done: 0, total: files.length });

      try {
        const results = await uploadDocuments(files, {
          concurrency: 2,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        const failed = results.filter((r): r is UploadFailure => !r.ok);
        const okCount = results.length - failed.length;
        setFailures(failed);
        setSuccessCount(okCount);
        if (okCount === 0 && failed.length > 0) {
          setError(`全部上传失败（${failed.length}）`);
        } else if (failed.length > 0) {
          setError(`成功 ${okCount}，失败 ${failed.length}`);
        }
        if (okCount > 0) {
          onUploaded?.();
        }
      } catch {
        setError("网络错误");
      } finally {
        setPending(false);
        setProgress(null);
      }
    },
    [onUploaded],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (list?.length) void uploadFiles(list);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  const statusLabel = pending
    ? progress
      ? `上传中 ${progress.done}/${progress.total}…`
      : "上传中…"
    : "拖拽文件到此处，或点击选择（可多选）";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onChange}
      />
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!pending) inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!pending) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/60"
        } ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {statusLabel}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          支持 TXT / Markdown / PDF，可一次多选（建议每个 &lt; 50MB）
        </p>
        {successCount !== null && !pending && failures.length === 0 && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            已上传 {successCount} 个文件
          </p>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {failures.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
          {failures.map((f) => (
            <li key={`${f.file.name}-${f.error}`}>
              {f.file.name}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Important:** Do **not** call `router.push` to review anymore.

- [ ] **Step 2: Smoke-check TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shelf/upload-dropzone.tsx
git commit -m "feat(shelf): multi-file upload dropzone without redirect"
```

---

### Task 5: Delete control on `DocumentList`

**Files:**
- Modify: `apps/web/src/components/shelf/document-list.tsx`

- [ ] **Step 1: Add optional delete UI**

Replace `apps/web/src/components/shelf/document-list.tsx` with:

```tsx
export type ShelfDocument = {
  id: string;
  title: string;
  status: string;
  shelfVisibility: string;
  sourceFilename: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  publishedAt: string | Date | null;
  ownerId: string;
};

type DocumentListProps = {
  documents: ShelfDocument[];
  emptyTitle: string;
  emptyDescription: string;
  showStatus?: boolean;
  allowDelete?: boolean;
  deletingId?: string | null;
  onDelete?: (doc: ShelfDocument) => void;
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "已上传",
  processing: "处理中",
  review: "待审阅",
  published: "已发布",
  failed: "失败",
};

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function docHref(doc: ShelfDocument): string {
  if (doc.status === "published") return `/app/docs/${doc.id}/read`;
  return `/app/docs/${doc.id}/review`;
}

export function DocumentList({
  documents,
  emptyTitle,
  emptyDescription,
  showStatus = true,
  allowDelete = false,
  deletingId = null,
  onDelete,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {emptyTitle}
        </h2>
        <p className="mt-2 text-sm text-zinc-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
      {documents.map((doc) => (
        <li key={doc.id}>
          <div className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900/60">
            <a href={docHref(doc)} className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {doc.title}
              </p>
              <p className="text-xs text-zinc-500">
                {doc.sourceFilename ? `${doc.sourceFilename} · ` : ""}
                更新于 {formatDate(doc.updatedAt)}
                {doc.publishedAt
                  ? ` · 发布于 ${formatDate(doc.publishedAt)}`
                  : ""}
              </p>
            </a>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              {showStatus && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
              )}
              <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                {doc.shelfVisibility === "public" ? "公开" : "私有"}
              </span>
              {allowDelete && onDelete && (
                <button
                  type="button"
                  disabled={deletingId === doc.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                  className="rounded-lg border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  {deletingId === doc.id ? "删除中…" : "删除"}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/shelf/document-list.tsx
git commit -m "feat(shelf): delete button on document list rows"
```

---

### Task 6: Wire `ShelfTabs` (reload + delete)

**Files:**
- Modify: `apps/web/src/components/shelf/shelf-tabs.tsx`

- [ ] **Step 1: Implement handlers**

Replace `apps/web/src/components/shelf/shelf-tabs.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DocumentList,
  type ShelfDocument,
} from "@/components/shelf/document-list";
import { UploadDropzone } from "@/components/shelf/upload-dropzone";

type Scope = "mine" | "public";

export function ShelfTabs() {
  const [scope, setScope] = useState<Scope>("mine");
  const [documents, setDocuments] = useState<ShelfDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (nextScope: Scope) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents?scope=${nextScope}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        documents?: ShelfDocument[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "加载失败");
        setDocuments([]);
        return;
      }
      setDocuments(data.documents ?? []);
    } catch {
      setError("网络错误");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  const handleDelete = useCallback(
    async (doc: ShelfDocument) => {
      const ok = window.confirm(
        `确定删除《${doc.title}》？此操作不可恢复。`,
      );
      if (!ok) return;

      setDeletingId(doc.id);
      setError(null);
      try {
        const res = await fetch(`/api/documents/${doc.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? "删除失败");
          return;
        }
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      } catch {
        setError("网络错误");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            书架
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理你的文章，或浏览实例内的公开阅读材料。
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
          {(
            [
              { id: "mine", label: "我的" },
              { id: "public", label: "公开" },
            ] as const
          ).map((tab) => {
            const active = scope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={
                  active
                    ? "rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "rounded-lg px-4 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {scope === "mine" && (
        <UploadDropzone onUploaded={() => void load("mine")} />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
            />
          ))}
          <p className="pt-2 text-center text-sm text-zinc-400">加载书架…</p>
        </div>
      ) : scope === "mine" ? (
        <DocumentList
          documents={documents}
          emptyTitle="还没有文章"
          emptyDescription="把 TXT / MD / PDF 拖到上方区域，或点击选择文件（可多选）。处理完成后可在此审阅与发布。"
          showStatus
          allowDelete
          deletingId={deletingId}
          onDelete={(doc) => void handleDelete(doc)}
        />
      ) : (
        <DocumentList
          documents={documents}
          emptyTitle="暂无公开文章"
          emptyDescription="当有人把已发布文章设为公开时，会出现在这里。"
          showStatus={false}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shelf/shelf-tabs.tsx
git commit -m "feat(shelf): wire multi-upload reload and document delete"
```

---

### Task 7: Align unused `UploadButton` (optional consistency)

**Files:**
- Modify: `apps/web/src/components/shelf/upload-button.tsx`

- [ ] **Step 1: Mirror multi-upload helper**

Replace body of `UploadButton` so it uses `uploadDocuments` with `multiple`, no `router.push`, same progress/error pattern as dropzone (simplified button label `上传中 2/5…`). Keep optional `onUploaded?: () => void` prop for future use.

```tsx
"use client";

import { useRef, useState } from "react";
import {
  uploadDocuments,
  type UploadFailure,
} from "@/lib/documents/upload-client";

type UploadButtonProps = {
  onUploaded?: () => void;
};

export function UploadButton({ onUploaded }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  function onPick() {
    setError(null);
    setFailures([]);
    inputRef.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;

    const files = Array.from(list).filter((f) => f.size > 0);
    if (files.length === 0) return;

    setPending(true);
    setError(null);
    setFailures([]);
    setProgress({ done: 0, total: files.length });
    try {
      const results = await uploadDocuments(files, {
        concurrency: 2,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const failed = results.filter((r): r is UploadFailure => !r.ok);
      const okCount = results.length - failed.length;
      setFailures(failed);
      if (okCount === 0 && failed.length > 0) {
        setError(`全部上传失败（${failed.length}）`);
      } else if (failed.length > 0) {
        setError(`成功 ${okCount}，失败 ${failed.length}`);
      }
      if (okCount > 0) onUploaded?.();
    } catch {
      setError("网络错误");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const label = pending
    ? progress
      ? `上传中 ${progress.done}/${progress.total}…`
      : "上传中…"
    : "上传文章";

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void onChange(e)}
      />
      <button
        type="button"
        onClick={onPick}
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {label}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {failures.length > 0 && (
        <ul className="max-w-xs space-y-1 text-xs text-red-600 dark:text-red-400">
          {failures.map((f) => (
            <li key={`${f.file.name}-${f.error}`}>
              {f.file.name}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/shelf/upload-button.tsx
git commit -m "feat(shelf): multi-file UploadButton for consistency"
```

---

### Task 8: Full test suite + manual checklist

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

```bash
cd apps/web && npm test
```

Expected: existing `anchor.test.ts` + new storage/upload-client tests all PASS.

- [ ] **Step 2: Manual verification (dev server)**

```bash
# from repo root, whatever the project already uses, e.g.:
cd apps/web && npm run dev
```

Checklist:

1. Open `/app/shelf` (logged in).
2. Multi-select 2+ small PDF/TXT → progress `上传中 x/y` → stay on shelf → list shows new rows.
3. Drop multiple files on dropzone → same.
4. Force one bad file (e.g. `.exe` or empty) mixed with good → partial success summary + good files appear.
5. Click **删除** on a mine doc → cancel confirm → still there.
6. Confirm delete → row gone; refresh still gone.
7. Public tab: no delete button.
8. Single file upload: stays on shelf (no auto jump to review).

- [ ] **Step 3: Final commit if any fixes**

Only if manual testing found bugs — fix, then:

```bash
git add -A
git commit -m "fix(shelf): multi-upload/delete follow-ups from manual QA"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| multi select/drop | Task 4, 7 |
| types/size unchanged | reuse POST (Task 4 uses existing API) |
| client loop concurrency 2 | Task 2, 4 |
| stay on shelf + summary | Task 4, 6 |
| no batch API | intentional omission |
| DELETE owner-only 204 | Task 3 |
| cascade + best-effort unlink | Task 1, 3 |
| confirm dialog | Task 6 |
| delete only mine UI | Task 5, 6 |
| public no delete | Task 6 |
| UploadButton consistency | Task 7 |

## Placeholder / consistency check

- Response status for delete: **204** everywhere.
- Helper names: `uploadDocumentFile`, `uploadDocuments`, `mapWithConcurrency`, `deleteUpload`.
- Concurrency default: **2**.
- Confirm copy matches design: `确定删除《${title}》？此操作不可恢复。`
