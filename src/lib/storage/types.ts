/**
 * Storage abstraction.
 *
 * Calling code only ever sees this interface. Phase 1 ships LocalDiskStorage
 * (writes under ./uploads). Swapping to Cloudflare R2 later means adding an
 * R2Storage implementation and changing STORAGE_DRIVER — no call sites change.
 */

export type PutInput = {
  /** Raw file bytes. */
  data: Buffer;
  /** Original filename, used only to derive an extension. */
  filename: string;
  /** MIME type, e.g. "image/png". */
  contentType: string;
  /** Logical folder, e.g. "people". Keeps keys tidy across drivers. */
  prefix?: string;
};

export type PutResult = {
  /** Driver-internal key, e.g. "people/abc123.png". Store this if you need to delete later. */
  key: string;
  /** URL the browser can load. Local driver returns an app route; R2 will return a CDN URL. */
  url: string;
};

export type GetResult = {
  data: Buffer;
  contentType: string;
};

export interface Storage {
  put(input: PutInput): Promise<PutResult>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<GetResult | null>;
  delete(key: string): Promise<void>;
  /** Reverse of PutResult.url — lets callers delete given only a stored photoUrl. */
  keyFromUrl(url: string): string | null;
}
