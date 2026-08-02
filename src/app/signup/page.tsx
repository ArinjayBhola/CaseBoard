"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
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
  const [image, setImage] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const canSubmit = useMemo(
    () =>
      email.trim().length > 0 &&
      password.length >= MIN_LENGTH &&
      confirm.length > 0 &&
      password === confirm,
    [email, password, confirm],
  );

  function validate(): boolean {
    const next: FieldErrors = {};

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

  function nextStep() {
    setFormError(null);
    if (step === 1) {
      const next: FieldErrors = {};
      if (!email.trim()) next.email = "Enter your email address.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That doesn’t look like a valid email address.";
      if (password.length < MIN_LENGTH) next.password = `Use at least ${MIN_LENGTH} characters.`;
      if (!confirm) next.confirm = "Re-enter your password.";
      else if (password !== confirm) next.confirm = "The two passwords don’t match.";
      setErrors(next); if (Object.keys(next).length === 0) setStep(2);
    } else if (step === 2) {
      const usernameError = !username.trim() ? "Enter a username." : username.trim().length > 50 ? "Use 50 characters or fewer." : undefined;
      setErrors(usernameError ? { username: usernameError } : {}); if (!usernameError) setStep(3);
    }
  }

  function goBack() {
    setFormError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function chooseImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Profile photos must be under 5 MB.");
      return;
    }
    setFormError(null);
    setImage(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.append("username", username); form.append("email", email); form.append("password", password);
      if (image) form.append("image", image);
      const res = await fetch("/api/signup", {
        method: "POST",
        body: form,
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
      <ol className="mb-7 flex items-center" aria-label="Signup progress">
        {["Account", "Username", "Photo"].map((label, index) => {
          const number = index + 1;
          const complete = step > number;
          const current = step === number;
          return (
            <li key={label} className={`flex items-center ${number < 3 ? "flex-1" : ""}`}>
              <button type="button" disabled={!complete} onClick={() => complete && setStep(number)} aria-current={current ? "step" : undefined} className={`group flex items-center gap-2 text-xs font-medium ${current || complete ? "text-terracotta-600" : "text-stone-400"} ${complete ? "cursor-pointer" : "cursor-default"}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition-colors ${current ? "border-terracotta-500 bg-terracotta-500 text-white shadow-sm" : complete ? "border-terracotta-500 bg-terracotta-500/10 group-hover:bg-terracotta-500/20" : "border-cream-300 bg-cream-50"}`}>{complete ? "✓" : number}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {number < 3 ? <span className={`mx-2 h-px flex-1 transition-colors ${step > number ? "bg-terracotta-400" : "bg-cream-300"}`} /> : null}
            </li>
          );
        })}
      </ol>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? <Alert>{formError}</Alert> : null}
        <div key={step} className="animate-slide-up space-y-5" aria-live="polite">
        {step === 1 ? <>
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
        <button type="button" onClick={nextStep} className="btn-primary btn-lg w-full">Continue</button>
        </> : null}

        {step === 2 ? <>
        <TextField
          label="Username"
          autoComplete="nickname"
          required
          autoFocus
          placeholder="How people should see you"
          value={username}
          error={errors.username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
        />

        <button type="button" onClick={nextStep} className="btn-primary btn-lg w-full">Continue</button>
        <button type="button" onClick={goBack} className="w-full text-sm text-stone-500 hover:text-stone-800">Back</button>
        </> : null}

        {step === 3 ? <>
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a profile photo"
          onClick={() => document.getElementById("signup-photo")?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("signup-photo")?.click(); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); chooseImage(e.dataTransfer.files?.[0]); }}
          className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            isDragging
              ? "border-terracotta-500 bg-terracotta-500/10"
              : "border-cream-300 bg-cream-50 hover:border-terracotta-400 hover:bg-cream-100"
          }`}
        >
          <input id="signup-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { chooseImage(e.target.files?.[0]); e.target.value = ""; }} />
          {imagePreview ? (
            <div className="flex items-center justify-center gap-4 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Profile preview" className="h-16 w-16 rounded-full border-2 border-white object-cover shadow-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-800">{image?.name}</p>
                <p className="mt-1 text-xs text-stone-500">Ready to use as your profile photo</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setImage(null); }} className="mt-2 text-xs font-medium text-clay-600 hover:underline">Remove photo</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-500/10 text-terracotta-600 transition-transform group-hover:-translate-y-0.5">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <p className="mt-3 text-sm font-semibold text-stone-800">Drop your photo here</p>
              <p className="mt-1 text-sm text-stone-500">or <span className="font-medium text-terracotta-600">browse files</span></p>
              <p className="mt-3 text-[11px] text-stone-400">JPG, PNG, WebP or GIF · max 5 MB</p>
            </>
          )}
        </div>
        <button
          type="submit"
          className="btn-primary btn-lg w-full transition-transform duration-200 hover:-translate-y-[1px]"
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
        <button type="button" onClick={goBack} className="w-full text-sm text-stone-500 hover:text-stone-800">Back</button>
        </> : null}
        </div>

        <p className="text-xs leading-relaxed text-stone-500">
          Your cases are private to you until you invite someone. Nothing is shared by
          default.
        </p>
      </form>
    </AuthShell>
  );
}
