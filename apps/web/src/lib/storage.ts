import { mkdir, writeFile } from "fs/promises";
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
