/**
 * Browser-side API client.
 *
 * Everything goes through API_BASE so Phase 3 can point the frontend at a
 * standalone Express server by setting NEXT_PUBLIC_API_BASE — no call sites change.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new ApiClientError(
      res.status,
      (body.error as string) ?? `Request failed (${res.status})`,
      body.issues as Record<string, string[]> | undefined,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<T>(path, { method: "POST", body: form });
  },
};
