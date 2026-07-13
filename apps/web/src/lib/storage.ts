import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export function uploadRoot(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  // Dev fallback: repo-root data/uploads (cwd is apps/web during next dev)
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "data", "uploads");
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

export function resolveUploadPath(relativeKey: string): string {
  return path.join(uploadRoot(), relativeKey);
}

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
