"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon } from "./icons";

type BaseProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shown on the right of the label, e.g. "Optional" or a forgot-password link. */
  action?: ReactNode;
};

type TextFieldProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;

/**
 * Labelled input with hint and error slots.
 *
 * The error is wired with `aria-describedby` and `aria-invalid` rather than only
 * being coloured, so it reaches screen readers and survives a colour-blind user.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, action, id, className, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="label mb-0" htmlFor={inputId}>
          {label}
        </label>
        {action}
      </div>

      <input
        {...props}
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`field ${error ? "field-error" : ""} ${className ?? ""}`}
      />

      <FieldMessage id={inputId} error={error} hint={hint} />
    </div>
  );
});

type PasswordFieldProps = BaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    /** Renders the strength meter below the input. */
    showStrength?: boolean;
    /** Renders a live "passwords match" indicator against this value. */
    matchAgainst?: string;
  };

/**
 * Password input with a visibility toggle.
 *
 * Typing a password blind is the single most common cause of a failed sign-in,
 * so the eye is on by default everywhere passwords are entered. The toggle is a
 * real button: keyboard reachable, and it announces its state.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { label, hint, error, action, id, className, showStrength, matchAgainst, ...props },
    ref,
  ) {
    const generated = useId();
    const inputId = id ?? generated;
    const [visible, setVisible] = useState(false);

    const value = typeof props.value === "string" ? props.value : "";
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    const matches = matchAgainst !== undefined && value.length > 0 && value === matchAgainst;

    return (
      <div className="w-full">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label className="label mb-0" htmlFor={inputId}>
            {label}
          </label>
          {action}
        </div>

        <div className="relative">
          <input
            {...props}
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            // Room on the right for the toggle, plus the match tick when present.
            className={`field pr-11 ${error ? "field-error" : ""} ${className ?? ""}`}
          />

          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            // Not a tab stop: keyboard users move label → input → next field
            // without a toggle interrupting every password.
            tabIndex={-1}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-cream-200 hover:text-stone-700"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {showStrength && value.length > 0 ? <StrengthMeter value={value} /> : null}

        {matchAgainst !== undefined && value.length > 0 ? (
          <p
            className={`mt-1.5 flex items-center gap-1 text-xs ${
              matches ? "text-terracotta-600" : "text-stone-500"
            }`}
          >
            {matches ? <CheckIcon size={14} /> : null}
            {matches ? "Passwords match" : "Passwords don’t match yet"}
          </p>
        ) : null}

        <FieldMessage id={inputId} error={error} hint={hint} />
      </div>
    );
  },
);

function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string | null;
  hint?: ReactNode;
}) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs text-clay-600">
        <AlertIcon size={14} className="mt-px shrink-0" />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-stone-500">
        {hint}
      </p>
    );
  }
  return null;
}

/**
 * Rough password strength.
 *
 * Deliberately advisory, not a gate: the only hard rule is the 8-character
 * minimum the server enforces. Length is weighted most heavily because it is
 * what actually matters, rather than demanding a symbol.
 */
export function scorePassword(value: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (value.length < 8) return { score: 0, label: "Too short" };

  let points = 0;
  if (value.length >= 12) points++;
  if (value.length >= 16) points++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points++;
  if (/\d/.test(value)) points++;
  if (/[^A-Za-z0-9]/.test(value)) points++;

  if (points <= 1) return { score: 1, label: "Weak" };
  if (points <= 3) return { score: 2, label: "Good" };
  return { score: 3, label: "Strong" };
}

function StrengthMeter({ value }: { value: string }) {
  const { score, label } = scorePassword(value);

  const colors = ["bg-clay-500", "bg-clay-500", "bg-amber-400", "bg-terracotta-500"];
  const textColors = [
    "text-clay-600",
    "text-clay-600",
    "text-amber-600",
    "text-terracotta-600",
  ];

  return (
    <div className="mt-2">
      <div className="flex gap-1" role="presentation">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              score > i ? colors[score] : "bg-cream-300"
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs ${textColors[score]}`} aria-live="polite">
        {label}
        {score === 0 ? " — at least 8 characters" : ""}
      </p>
    </div>
  );
}
