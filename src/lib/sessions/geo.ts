/**
 * Best-effort IP → city/country.
 *
 * Privacy note: for a source-protection tool, sending a user's IP to a third
 * party is a real tradeoff. So this is:
 *   - off unless SESSION_GEO_LOOKUP="on" (default off),
 *   - never called for private/loopback addresses,
 *   - fully degrading — a failure just yields no location, never an error.
 *
 * When off (or on localhost), sessions still show device + IP, just no city.
 */

/** RFC1918 / loopback / link-local — never leaves the machine or LAN. */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const v = ip.trim();
  if (v === "::1" || v === "127.0.0.1" || v.startsWith("::ffff:127.")) return true;
  if (v === "0.0.0.0" || v.toLowerCase() === "localhost") return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^169\.254\./.test(v)) return true;
  if (/^(fc|fd)/i.test(v)) return true; // unique local IPv6
  if (/^fe80:/i.test(v)) return true; // link-local IPv6
  return false;
}

export type Geo = { city: string | null; country: string | null };

const EMPTY: Geo = { city: null, country: null };

export async function lookupGeo(ip: string | null | undefined): Promise<Geo> {
  if (!ip) return EMPTY;
  if (isPrivateIp(ip)) return { city: "Local network", country: null };
  if (process.env.SESSION_GEO_LOOKUP !== "on") return EMPTY;

  try {
    // ip-api.com: keyless, HTTP, generous free tier. Timeout so a slow lookup
    // never holds up sign-in.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as { status?: string; city?: string; country?: string };
    if (data.status !== "success") return EMPTY;
    return { city: data.city ?? null, country: data.country ?? null };
  } catch {
    return EMPTY;
  }
}
