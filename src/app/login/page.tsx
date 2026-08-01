"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/ui/Alert";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/icons";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const revoked = params.get("reason") === "revoked";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await signIn("credentials", { email, password, redirect: false });

      if (res?.error) {
        // Deliberately does not say which of the two was wrong — that would
        // confirm whether an account exists for this address.
        setError("That email and password don’t match an account.");
        setBusy(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {revoked && !error ? (
        <Alert tone="info">
          You were signed out of this device. Sign in again to continue.
        </Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <PasswordField
        label="Password"
        autoComplete="current-password"
        required
        placeholder="Your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button 
        type="submit" 
        className="btn-primary btn-lg w-full transition-transform duration-200 hover:-translate-y-[1px]" 
        disabled={busy}
      >
        {busy ? (
          <>
            <Spinner /> Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to get back to your investigations."
      footer={
        <>
          No account yet?{" "}
          <Link
            href="/signup"
            className="font-medium text-terracotta-600 underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
            <div className="skeleton h-11" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
