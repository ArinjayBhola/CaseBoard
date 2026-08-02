import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import type { GetResult, PutInput, PutResult, Storage } from "./types";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

/** URL prefix served by src/app/api/files/[...key]/route.ts */
const URL_PREFIX = "/api/files/";

export class LocalDiskStorage implements Storage {
  private readonly root: string;

  constructor(root = process.env.LOCAL_UPLOAD_DIR ?? "./uploads") {
    this.root = path.resolve(process.cwd(), root);
  }

  /** Resolve a key to an absolute path, refusing anything that escapes the root. */
  private resolveKey(key: string): string | null {
    const normalized = path.normalize(key).replace(/^([/\\])+/, "");
    const full = path.resolve(this.root, normalized);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) return null;
    return full;
  }

  async put(input: PutInput): Promise<PutResult> {
    const ext =
      EXT_BY_TYPE[input.contentType] ??
      (path.extname(input.filename).toLowerCase() || ".bin");
    const prefix = input.prefix ? `${input.prefix}/` : "";
    const key = `${prefix}${randomUUID()}${ext}`;

    const full = this.resolveKey(key);
    if (!full) throw new Error("Invalid storage key");

    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.data);

    return { key, url: `${URL_PREFIX}${key}` };
  }

  async get(key: string): Promise<GetResult | null> {
    const full = this.resolveKey(key);
    if (!full) return null;
    try {
      const data = await readFile(full);
      const contentType =
        TYPE_BY_EXT[path.extname(full).toLowerCase()] ?? "application/octet-stream";
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    if (!full) return;
    try {
      await unlink(full);
    } catch {
      // Already gone — deleting is idempotent.
    }
  }

  keyFromUrl(url: string): string | null {
    if (!url.startsWith(URL_PREFIX)) return null;
    return url.slice(URL_PREFIX.length);
  }
}
