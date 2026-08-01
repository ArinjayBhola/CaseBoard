/**
 * Identity chip used for accounts, call participants, and person cards.
 *
 * Colour is derived from the seed rather than random, so the same person is the
 * same colour everywhere in the app and across sessions.
 */

const PALETTE = [
  "#C0714F",
  "#CE8C24",
  "#8C8177",
  "#A65C3C",
  "#6B615A",
  "#B5503F",
  "#AC731A",
  "#D08A6B",
];

export function colorFromSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const sizes = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${sizes[size]} shrink-0 rounded-full border border-cream-300 object-cover ${className ?? ""}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: colorFromSeed(name) }}
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full font-semibold text-cream-50 ${className ?? ""}`}
    >
      {initial}
    </span>
  );
}
