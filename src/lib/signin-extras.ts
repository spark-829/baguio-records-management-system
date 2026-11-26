/**
 * Pure helpers for the sign-in page extras: the "last signed in" note shown once after sign-in
 * (new device or network flag, like bank and GitHub sign-in alerts) and the system status line.
 */

/** Short cookie that carries the note from the sign-in action to the first page; read once in the browser. */
export const SIGNIN_NOTE_COOKIE = "rms-signin-note";
export const SIGNIN_NOTE_SECONDS = 300;

export type SigninInfo = {
  first?: boolean;
  previous_at?: string | null;
  previous_ua?: string | null;
  current_ua?: string | null;
  new_ip?: boolean;
  earlier_uas?: (string | null)[] | null;
};

export type SigninNote = { first: true } | { first: false; at: string; device: string; newIp: boolean; newDevice: boolean };

/** "Chrome on Windows" from a browser's user agent; "an unknown browser" when it cannot tell. */
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? "";
  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser\//.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS\//.test(s)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : null;
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iPhone or iPad"
    : /Android/.test(s)
      ? "Android"
      : /Windows/.test(s)
        ? "Windows"
        : /CrOS/.test(s)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /Linux/.test(s)
              ? "Linux"
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "an unknown browser";
}

/** Turns rms_my_signin_info() into the note; null when there is nothing safe to show. */
export function buildSigninNote(info: SigninInfo | null | undefined): SigninNote | null {
  if (!info || typeof info !== "object") return null;
  if (info.first) return { first: true };
  if (!info.previous_at || Number.isNaN(Date.parse(info.previous_at))) return null;
  const now = deviceLabel(info.current_ua);
  const earlier = (info.earlier_uas ?? []).map(deviceLabel);
  const known = now !== "an unknown browser";
  return {
    first: false,
    at: new Date(info.previous_at).toISOString(),
    device: deviceLabel(info.previous_ua),
    newIp: info.new_ip === true,
    newDevice: known && earlier.length > 0 && !earlier.includes(now),
  };
}

/** Cookie value; Next's cookies().set() URL-encodes it on the way out. */
export function encodeSigninNote(note: SigninNote): string {
  return JSON.stringify(note);
}

/** Reads the raw value from document.cookie (still URL-encoded) back; anything malformed is ignored. */
export function decodeSigninNote(raw: string | null | undefined): SigninNote | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    if (v?.first === true) return { first: true };
    if (v?.first !== false || typeof v.at !== "string" || Number.isNaN(Date.parse(v.at)) || typeof v.device !== "string") return null;
    return { first: false, at: v.at, device: v.device.slice(0, 60), newIp: v.newIp === true, newDevice: v.newDevice === true };
  } catch {
    return null;
  }
}

export type SystemStatus = "checking" | "up" | "down";

/** Reads the /api/health answer. Anything but a clear "db up" counts as down. */
export function statusFromHealth(httpOk: boolean, body: unknown): Exclude<SystemStatus, "checking"> {
  const b = body as { ok?: unknown; db?: unknown } | null;
  return httpOk && b?.ok === true && b?.db === "up" ? "up" : "down";
}
