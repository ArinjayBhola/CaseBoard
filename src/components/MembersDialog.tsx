"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { TextField } from "@/components/ui/Field";
import { CheckIcon, Spinner } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";

type MemberRole = "editor" | "viewer";
type Member = {
  id: string;
  userId: string;
  email: string;
  role: MemberRole;
  addedAt: string;
};
type MembersResponse = {
  owner: { id: string; email: string };
  members: Member[];
  viewerIsOwner: boolean;
};

type ShareLink = {
  token: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  viewerCount: number;
};
type ShareDuration = "1h" | "infinite" | "custom";

/** Live countdown, or the absolute time once it's more than a day out. */
function expiryLabel(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "Never expires — active until you revoke it.";
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "Expired.";
  if (ms > 24 * 60 * 60_000) {
    return `Expires ${new Date(expiresAt).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    })}.`;
  }
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return `Expires in ${clock}.`;
}

/**
 * Case sharing. Membership grants access; each member is an editor (full edit,
 * the default) or a viewer (read-only). Only the owner can add, remove, or
 * change roles. A role change takes effect for the member inside their session.
 */
export function MembersDialog({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [shareDuration, setShareDuration] = useState<ShareDuration>("1h");
  const [customMins, setCustomMins] = useState(60);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [qr, setQr] = useState<string | null>(null);
  const toast = useToast();

  // Render a QR of the link so it can be opened from a phone.
  useEffect(() => {
    if (!shareLink) {
      setQr(null);
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((mod) =>
        mod.toDataURL(shareLink.url, {
          width: 120,
          margin: 1,
          color: { dark: "#1E293B", light: "#FFFFFF" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareLink]);

  // Tick once a second so the expiry countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function createShare() {
    setShareBusy(true);
    try {
      const body =
        shareDuration === "custom"
          ? { duration: "custom", minutes: customMins }
          : { duration: shareDuration };
      const { link } = await api.post<{ link: ShareLink }>(
        `/api/cases/${caseId}/share-link`,
        body,
      );
      const regenerated = !!shareLink;
      setShareLink(link);
      toast.success(regenerated ? "New link created — the old one stopped working" : "Share link created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link");
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    setShareBusy(true);
    try {
      await api.del(`/api/cases/${caseId}/share-link`);
      setShareLink(null);
      toast.success("Link revoked — it no longer opens for anyone");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the link");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink.url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<MembersResponse>(`/api/cases/${caseId}/members`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load members");
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  // The share link is owner-only, so only fetch it once we know the viewer owns
  // the case (the endpoint 404s for everyone else).
  useEffect(() => {
    if (!data?.viewerIsOwner) return;
    let cancelled = false;

    const refresh = () =>
      api
        .get<{ link: ShareLink | null }>(`/api/cases/${caseId}/share-link`)
        .then((res) => {
          if (!cancelled) setShareLink(res.link);
        })
        .catch(() => {
          // No link yet, or not permitted — leave the create UI showing.
        });

    void refresh();
    // Refresh periodically so the live viewer count and expiry stay current.
    const timer = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [data?.viewerIsOwner, caseId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const member = await api.post<Member>(`/api/cases/${caseId}/members`, {
        email,
        role: inviteRole,
      });
      setData((prev) => (prev ? { ...prev, members: [...prev.members, member] } : prev));
      setEmail("");
      toast.success(`${member.email} can now open this case`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that person");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: Member) {
    setError(null);
    try {
      await api.del(`/api/cases/${caseId}/members/${member.id}`);
      setData((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.id !== member.id) } : prev,
      );
      toast.success(`Removed ${member.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that person");
    }
  }

  async function changeRole(member: Member, role: MemberRole) {
    if (member.role === role) return;
    // Optimistic: reflect the choice immediately, roll back if the server refuses.
    setData((prev) =>
      prev
        ? { ...prev, members: prev.members.map((m) => (m.id === member.id ? { ...m, role } : m)) }
        : prev,
    );
    try {
      await api.patch(`/api/cases/${caseId}/members/${member.id}`, { role });
      toast.success(`${member.email} is now ${role === "viewer" ? "a viewer" : "an editor"}`);
    } catch (err) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) =>
                m.id === member.id ? { ...m, role: member.role } : m,
              ),
            }
          : prev,
      );
      toast.error(err instanceof Error ? err.message : "Could not change that role");
    }
  }

  return (
    <Modal
      title="People with access"
      description="Editors can change the case; viewers can only look."
      onClose={onClose}
      dismissible={false}
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}

      {data?.viewerIsOwner ? (
        <div className="mb-4 rounded-lg border border-cream-300 bg-cream-100 p-3">
          <p className="text-sm font-medium text-stone-700">Shareable view-only link</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
            Anyone with the link can view this board — no account needed. They can look, not
            edit. Revoke or expiry cuts access immediately, even mid-view.
          </p>

          {shareLink ? (
            <>
              <div className="mt-2.5 flex gap-2">
                <input
                  readOnly
                  value={shareLink.url}
                  onFocus={(e) => e.target.select()}
                  className="field flex-1 text-xs"
                  aria-label="Share link"
                />
                <button className="btn-secondary btn-sm shrink-0" onClick={copyShareUrl}>
                  {shareCopied ? (
                    <>
                      <CheckIcon size={14} /> Copied
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                <span>{expiryLabel(shareLink.expiresAt, now)}</span>
                {shareLink.viewerCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-stone-600">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {shareLink.viewerCount} viewing now
                  </span>
                ) : null}
              </p>
              {qr ? (
                <div className="mt-2.5 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt="QR code for the share link"
                    className="h-[88px] w-[88px] rounded border border-cream-300 bg-white p-1"
                  />
                  <span className="text-xs text-stone-500">Scan to open on a phone.</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="btn-ghost btn-sm hover:bg-clay-500/10 hover:text-clay-600"
                  onClick={revokeShare}
                  disabled={shareBusy}
                >
                  Revoke now
                </button>
                <button className="btn-ghost btn-sm" onClick={createShare} disabled={shareBusy}>
                  {shareBusy ? "Working…" : "Regenerate"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="share-duration">
                  Link stays open
                </label>
                <select
                  id="share-duration"
                  className="h-[38px] rounded-md border border-cream-300 bg-cream-50 px-2 text-sm text-stone-700"
                  value={shareDuration}
                  onChange={(e) => setShareDuration(e.target.value as ShareDuration)}
                >
                  <option value="1h">For 1 hour</option>
                  <option value="infinite">Forever</option>
                  <option value="custom">Custom…</option>
                </select>
              </div>
              {shareDuration === "custom" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="share-mins">
                    Minutes
                  </label>
                  <input
                    id="share-mins"
                    type="number"
                    min={1}
                    className="field h-[38px] w-24 text-sm"
                    value={customMins}
                    onChange={(e) => setCustomMins(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              ) : null}
              <button className="btn-primary btn-sm" onClick={createShare} disabled={shareBusy}>
                {shareBusy ? "Creating…" : "Create link"}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!data ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 px-1 py-2">
              <span className="skeleton h-9 w-9 rounded-full" />
              <span className="skeleton h-4 flex-1" />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="space-y-0.5">
            <li className="flex items-center gap-3 rounded-md bg-cream-200 px-3 py-2.5">
              <Avatar name={data.owner.email.split("@")[0]} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-stone-800">
                  {data.owner.email}
                </span>
                <span className="block text-xs text-stone-500">Owner · always can edit</span>
              </span>
            </li>

            {data.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-cream-100"
              >
                <Avatar name={member.email.split("@")[0]} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-stone-800">
                    {member.email}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {member.role === "viewer" ? "Viewer · read-only" : "Editor · can edit"}
                  </span>
                </span>
                {data.viewerIsOwner ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${member.id}`}>
                      Role for {member.email}
                    </label>
                    <select
                      id={`role-${member.id}`}
                      className="shrink-0 rounded-md border border-cream-300 bg-cream-50 px-2 py-1 text-xs text-stone-700"
                      value={member.role}
                      onChange={(e) => changeRole(member, e.target.value as MemberRole)}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="btn-ghost btn-sm shrink-0 hover:bg-clay-500/10 hover:text-clay-600"
                      onClick={() => remove(member)}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>

          {data.members.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-cream-300 px-3 py-4 text-center text-sm text-stone-500">
              Nobody else has access yet.
            </p>
          ) : null}

          {data.viewerIsOwner ? (
            <form onSubmit={invite} className="divider mt-5 pt-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <TextField
                    label="Add someone"
                    id="invite-email"
                    type="email"
                    placeholder="their@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="shrink-0">
                  <label
                    className="mb-1 block text-xs font-medium text-stone-600"
                    htmlFor="invite-role"
                  >
                    Role
                  </label>
                  <select
                    id="invite-role"
                    className="h-[38px] rounded-md border border-cream-300 bg-cream-50 px-2 text-sm text-stone-700"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="btn-primary shrink-0"
                  disabled={busy || !email.trim()}
                >
                  {busy ? (
                    <>
                      <Spinner /> Adding…
                    </>
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">
                They need a CaseBoard account already — there are no invite emails yet.
                Editors can change everything; viewers can only look. During a call, the
                host can further restrict an editor.
              </p>
            </form>
          ) : (
            <p className="divider mt-5 pt-4 text-xs text-stone-500">
              Only the case owner can change who has access.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
