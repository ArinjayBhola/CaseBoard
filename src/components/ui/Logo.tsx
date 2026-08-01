/**
 * CaseBoard brand.
 *
 * The mark is the app itself in miniature: three pins on a board joined by
 * thread — the relationship graph every case is built from. Monochrome and
 * drawn in `currentColor`, so it inherits whatever colour it sits on (cream on
 * the terracotta tile, terracotta on cream, etc.).
 */

export function LogoMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* The board. */}
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.4"
      />
      {/* Thread between the pins. */}
      <path
        d="M8 8.5 16 8.5M8 8.5 12 15.5M16 8.5 12 15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Pins. */}
      <circle cx="8" cy="8.5" r="2.1" fill="currentColor" />
      <circle cx="16" cy="8.5" r="2.1" fill="currentColor" />
      <circle cx="12" cy="15.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

const TILE = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-9 w-9" };
const GLYPH = { sm: 16, md: 18, lg: 20 };
const TEXT = { sm: "text-base", md: "text-lg", lg: "text-xl" };

/**
 * Brand lockup: the mark in its terracotta tile, next to the wordmark. Callers
 * wrap it in whatever link they need, so it stays a pure presentational unit.
 */
export function Logo({
  size = "md",
  wordmark = true,
}: {
  size?: keyof typeof TILE;
  /** Drop the text to show the mark alone (tight spaces). */
  wordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`flex ${TILE[size]} items-center justify-center rounded-md bg-terracotta-600 text-cream-50`}
      >
        <LogoMark size={GLYPH[size]} />
      </span>
      {wordmark ? (
        <span className={`${TEXT[size]} font-semibold tracking-tight`}>CaseBoard</span>
      ) : null}
    </span>
  );
}
