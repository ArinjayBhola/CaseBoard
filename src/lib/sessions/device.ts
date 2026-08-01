/**
 * Turn a User-Agent string into a short human label like "iPhone · Safari".
 *
 * Deliberately small and dependency-free. Browsers never reveal the actual
 * machine name (there is no "MacBook Pro of Jane" in a UA — that would be a
 * privacy leak), so the best honest label is device/OS + browser.
 */

type Parsed = { device: string; os: string; browser: string };

function osOf(ua: string): string {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown device";
}

function browserOf(ua: string): string {
  // Order matters: Edge and Chrome both contain "Chrome"; Chrome contains "Safari".
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}

/** Whether the agent looks like a phone/tablet, for choosing an icon. */
export function isMobileAgent(ua: string): boolean {
  return /iPhone|iPad|Android|Mobile/i.test(ua);
}

export function parseUserAgent(ua: string | null | undefined): Parsed {
  if (!ua) return { device: "Unknown device", os: "Unknown device", browser: "Browser" };
  const os = osOf(ua);
  const browser = browserOf(ua);
  return { device: `${os} · ${browser}`, os, browser };
}
