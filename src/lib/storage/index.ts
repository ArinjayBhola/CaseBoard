import { R2Storage } from "./r2";
import type { Storage } from "./types";

export type { Storage, PutInput, PutResult, GetResult } from "./types";

/**
 * Every uploaded key lives under its owner's prefix, so serving and importing
 * can authorise on the key alone without a database lookup.
 */
export function userKeyPrefix(userId: string, area = "people") {
  return `users/${userId}/${area}`;
}

/** True when `url` points at a file this user uploaded. */
export function ownsUploadUrl(userId: string, url: string) {
  const key = storage().keyFromUrl(url);
  if (!key) return false;
  return key.startsWith(`users/${userId}/`);
}

let instance: Storage | null = null;

/**
 * Single entry point for file storage. Import this, never a concrete driver.
 */
export function storage(): Storage {
  if (instance) return instance;

  const driver = process.env.STORAGE_DRIVER ?? "r2";
  switch (driver) {
    case "r2":
      instance = new R2Storage();
      break;
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
  return instance;
}
