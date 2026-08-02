"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/icons";

export function ProfilePhotoEditor({ imageUrl }: { imageUrl?: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("scope", "profile");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploaded.error ?? "Couldn’t upload photo.");
      const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: uploaded.url }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn’t save photo.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn’t update photo."); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: null }) });
      if (!res.ok) throw new Error("Couldn’t remove photo.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn’t remove photo."); }
    finally { setBusy(false); }
  }

  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="text-terracotta-600 hover:underline">{busy ? <Spinner size={13} /> : imageUrl ? "Replace photo" : "Add profile photo"}</button>
    {imageUrl ? <button type="button" disabled={busy} onClick={() => void remove()} className="text-stone-500 hover:text-clay-600 hover:underline">Remove</button> : null}
    {error ? <span className="text-clay-600">{error}</span> : null}
  </div>;
}
