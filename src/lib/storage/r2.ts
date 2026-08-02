import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";
import type { GetResult, PutInput, PutResult, Storage } from "./types";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for R2 storage`);
  return value;
}

export class R2Storage implements Storage {
  private readonly bucket = required("R2_BUCKET");
  private readonly publicUrl = required("R2_PUBLIC_URL").replace(/\/$/, "");
  private readonly client = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });

  async put(input: PutInput): Promise<PutResult> {
    const ext = EXT_BY_TYPE[input.contentType] ?? (path.extname(input.filename).toLowerCase() || ".bin");
    const key = `${input.prefix ? `${input.prefix}/` : ""}${randomUUID()}${ext}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.data,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return { key, url: `${this.publicUrl}/${key}` };
  }

  async get(key: string): Promise<GetResult | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      return { data: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicUrl}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
