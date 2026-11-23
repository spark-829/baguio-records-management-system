/** "in-2026-12", " IN 2026 0012 ", "IN–2026–0012" -> "IN-2026-0012"; anything else -> null. */
export function parseReplyTo(input: string | null | undefined): string | null {
  const s = (input ?? "").trim().toUpperCase().replace(/[\s_‐-―-]+/g, "-");
  const m = /^IN-?(\d{4})-?(\d{1,7})$/.exec(s);
  return m ? `IN-${m[1]}-${String(Number(m[2])).padStart(4, "0")}` : null;
}
