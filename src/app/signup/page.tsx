"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useMemo, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/ui/Alert";
import { PasswordField, TextField, scorePassword } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/icons";

const MIN_LENGTH = 8;

type FieldErrors = { username?: string; email?: string; password?: string; confirm?: string };

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () =>
      email.trim().length > 0 &&
      username.trim().length > 0 &&
      password.length >= MIN_LENGTH &&
      confirm.length > 0 &&
      password === confirm,
    [email, password, confirm],
  );

  function validate(): boolean {
    const next: FieldErrors = {};

    if (!username.trim()) next.username = "Enter a username.";
    else if (username.trim().length > 50) next.username = "Use 50 characters or fewer.";

    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "That doesn’t look like a valid email address.";
    }

    if (password.length < MIN_LENGTH) {
      next.password = `Use at least ${MIN_LENGTH} characters.`;
    }

    if (!confirm) next.confirm = "Re-enter your password.";
    else if (password !== confirm) next.confirm = "The two passwords don’t match.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));

        // Map server-side validation back onto the field it belongs to, rather
        // than dropping everything into one banner above the form.
        const emailIssue = body.issues?.email?.[0];
        const usernameIssue = body.issues?.username?.[0];
        const passwordIssue = body.issues?.password?.[0];

        if (usernameIssue || emailIssue || passwordIssue) {
          setErrors({ username: usernameIssue, email: emailIssue, password: passwordIssue });
        } else if (res.status === 409) {
          setErrors({ email: "An account already uses that email address." });
        } else {
          setFormError(body.error ?? "Couldn’t create your account. Please try again.");
        }
        setBusy(false);
        return;
      }

      // Account created — sign straight in rather than bouncing to /login.
      await signIn("credentials", { email, password, redirect: false });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setFormError("Couldn’t reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  const strength = password ? scorePassword(password) : null;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start a new investigation workspace. It takes a moment."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-terracotta-600 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? <Alert>{formError}</Alert> : null}

        <TextField
          label="Username"
          autoComplete="nickname"
          required
          autoFocus
          placeholder="How people should see you"
          value={username}
          error={errors.username}
          hint="Choose the name you want others to see."
          onChange={(e) => {
            setUsername(e.target.value);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
        />

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />

        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          placeholder="At least 8 characters"
          value={password}
          error={errors.password}
          showStrength
          hint={
            strength ? undefined : "Longer beats complicated — a short phrase works well."
          }
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          required
          placeholder="Type it once more"
          value={confirm}
          matchAgainst={password}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
          }}
        />

        <button
          type="submit"
          className="btn-primary btn-lg w-full"
          disabled={busy || !canSubmit}
        >
          {busy ? (
            <>
              <Spinner /> Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>

        <p className="text-xs leading-relaxed text-stone-500">
          Your cases are private to you until you invite someone. Nothing is shared by
          default.
        </p>
      </form>
    </AuthShell>
  );
}
