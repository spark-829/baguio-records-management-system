/** Only same-origin paths may be used as a post-login destination (prevents open redirects). */
export function safeNextPath(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 300) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f\u007f]/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v, "https://rms.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://rms.invalid") return null;
  if (u.pathname.startsWith("//") || u.pathname.includes("\\")) return null;
  if (u.pathname.startsWith("/login") || u.pathname.startsWith("/api/") || u.pathname.startsWith("/mfa")) return null;
  return u.pathname + u.search;
}
