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
