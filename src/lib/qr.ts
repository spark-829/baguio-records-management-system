/** QR helpers: the slip QR opens /r/<tracking>; scanning only ever yields internal paths. */
export const TRACKING_RE = /^(IN|OUT)-\d{4}-\d{4,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const scanPath = (tn: string) => `/r/${encodeURIComponent(tn.trim().toUpperCase())}`;
export const scanUrl = (origin: string, tn: string) => `${origin.replace(/\/+$/, "")}${scanPath(tn)}`;

/** Returns an internal path for a scanned text, or null. Never returns a full URL: we never navigate off-site. */
export function parseScannedText(text: string): string | null {
  const t = text.trim();
  if (TRACKING_RE.test(t)) return scanPath(t);
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "r") {
    let tn: string;
    try {
      tn = decodeURIComponent(parts[1]);
    } catch {
      return null;
    }
    return TRACKING_RE.test(tn) ? scanPath(tn) : null;
  }
  if (parts.length === 2 && parts[0] === "records" && UUID_RE.test(parts[1])) return `/records/${parts[1].toLowerCase()}`;
  return null;
}
