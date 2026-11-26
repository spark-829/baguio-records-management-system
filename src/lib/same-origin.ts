/**
 * True when a request was sent by one of this site's own pages (QA-091: no sign-out from other sites).
 * Uses the Origin header, then the browser's Sec-Fetch-Site, then the Referer. A request with none of them is refused.
 */
export function isSameOrigin(h: Pick<Headers, "get">, fallbackOrigin: string): boolean {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? hostOf(fallbackOrigin) ?? "").toLowerCase();
  if (!host) return false;
  const origin = h.get("origin");
  if (origin && origin !== "null") return hostOf(origin) === host;
  if (origin === "null") return false;
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const ref = h.get("referer");
  return ref ? hostOf(ref) === host : false;
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}
