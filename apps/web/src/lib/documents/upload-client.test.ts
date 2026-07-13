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
      vi.fn(
        async () =>
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
      vi.fn(
        async () =>
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
