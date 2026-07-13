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
