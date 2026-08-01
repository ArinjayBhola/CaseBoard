"use client";

import { useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { PasswordField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/icons";

const MIN_LENGTH = 8;

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>(
    {},
  );
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => current.length > 0 && next.length >= MIN_LENGTH && next === confirm,
    [current, next, confirm],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const fieldErrors: typeof errors = {};
    if (!current) fieldErrors.current = "Enter your current password.";
    if (next.length < MIN_LENGTH) fieldErrors.next = `Use at least ${MIN_LENGTH} characters.`;
    if (next && next === current) {
      fieldErrors.next = "That’s the same as your current password.";
    }
    if (next !== confirm) fieldErrors.confirm = "The two passwords don’t match.";

    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await api.post<{ ok: true; signedOut: number }>("/api/account/password", {
        currentPassword: current,
        newPassword: next,
      });
      const extra =
        res.signedOut > 0
          ? ` Signed out ${res.signedOut} other ${res.signedOut === 1 ? "device" : "devices"}.`
          : "";
      setStatus({ tone: "success", message: `Password updated.${extra}` });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      if (err instanceof ApiClientError) {
        const issue = err.issues?.newPassword?.[0];
        if (issue) setErrors({ next: issue });
        else if (err.status === 400) setErrors({ current: err.message });
        else setStatus({ tone: "error", message: err.message });
      } else {
        setStatus({
          tone: "error",
          message: "Couldn’t reach the server. Check your connection and try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {status ? <Alert tone={status.tone}>{status.message}</Alert> : null}

      <PasswordField
        label="Current password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
        value={current}
        error={errors.current}
        onChange={(e) => {
          setCurrent(e.target.value);
          if (errors.current) setErrors((p) => ({ ...p, current: undefined }));
        }}
      />

      <div className="divider pt-4" />

      <PasswordField
        label="New password"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        minLength={MIN_LENGTH}
        hint="Use special characters, capital letters, small letters, and numbers for a strong password."
        value={next}
        error={errors.next}
        showStrength
        onChange={(e) => {
          setNext(e.target.value);
          if (errors.next) setErrors((p) => ({ ...p, next: undefined }));
        }}
      />

      <PasswordField
        label="Confirm new password"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        value={confirm}
        matchAgainst={next}
        error={errors.confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
        }}
      />

      <div className="flex justify-end pt-1">
        <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
          {busy ? (
            <>
              <Spinner /> Updating…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </div>
    </form>
  );
}
