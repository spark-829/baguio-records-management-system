/**
 * Server-side session rules (QA-089). Pure helpers, used by the middleware and the sign-in action.
 *
 * - The Supabase sign-in cookies are HttpOnly, Secure and SameSite=Lax, and last at most 12 hours.
 * - A second cookie, "rms-seen", holds the time of the user's last request, signed with a server key and
 *   bound to the user id. The middleware signs people out when it is older than the idle limit, so a copied
 *   cookie stops working once the real user has been away, even with the browser timer bypassed.
 */

export const SEEN_COOKIE = "rms-seen";
export const SESSION_MAX_AGE = 12 * 60 * 60;
/** Extra time on top of the idle limit, so the browser's own countdown always acts first. */
export const IDLE_GRACE_SEC = 120;
/** The "last seen" cookie is rewritten at most this often. */
export const SEEN_REFRESH_SEC = 30;

type CookieOpts = { maxAge?: number; [k: string]: unknown };

export function hardenCookie<T extends CookieOpts>(options: T | undefined, secure: boolean): T & CookieOpts {
  const o = (options ?? {}) as T;
  const maxAge = o.maxAge === 0 ? 0 : Math.min(typeof o.maxAge === "number" && o.maxAge > 0 ? o.maxAge : SESSION_MAX_AGE, SESSION_MAX_AGE);
  return { ...o, httpOnly: true, secure, sameSite: "lax", path: "/", maxAge };
}

const enc = new TextEncoder();

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(`rms-seen:${key}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type Seen = { start: number; seen: number; limit: number };

export async function signSeen(key: string, userId: string, v: Seen): Promise<string> {
  const start = Math.floor(v.start);
  const seen = Math.floor(v.seen);
  const limit = Math.max(0, Math.floor(v.limit));
  return `${start}.${seen}.${limit}.${await hmac(key, `${userId}|${start}|${seen}|${limit}`)}`;
}

export async function readSeen(key: string, userId: string, value: string | undefined): Promise<Seen | null> {
  const m = /^(\d{1,12})\.(\d{1,12})\.(\d{1,5})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!m) return null;
  const [start, seen, limit] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const expected = await hmac(key, `${userId}|${start}|${seen}|${limit}`);
  // Compare all characters so the time taken does not reveal how much matched.
  let diff = expected.length ^ m[4].length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (m[4].charCodeAt(i) || 0);
  return diff === 0 ? { start, seen, limit } : null;
}

/**
 * True when the sign-in should end: away longer than the idle limit (plus grace), or signed in for more
 * than 12 hours in total (the database's session_max_hours default). A limit of 0 means no idle limit.
 */
export function sessionExpired(v: Seen, nowSec: number): boolean {
  if (v.seen > nowSec + 300 || v.start > nowSec + 300) return true; // times in the future were never written by us
  if (nowSec - v.start > SESSION_MAX_AGE) return true;
  if (!(v.limit > 0)) return false;
  return nowSec - v.seen > v.limit * 60 + IDLE_GRACE_SEC;
}

/** Background requests (the alert bell's poll, link prefetches) do not count as the user being active. */
export function isBackgroundRequest(h: Pick<Headers, "get">): boolean {
  return h.get("x-rms-background") === "1" || h.get("next-router-prefetch") !== null || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch") === true;
}
