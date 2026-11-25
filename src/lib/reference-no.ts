export const DEFAULT_REF_LABEL = "Reference no. from another system";
export const REF_MAX = 40;

/** Trim a reference number typed by staff. Blank means none. */
export function cleanRefNo(s: string | null | undefined): { ok: string | null } | { error: string } {
  const v = (s ?? "").trim();
  if (!v) return { ok: null };
  if (v.length > REF_MAX) return { error: "Keep the reference number under 40 characters." };
  return { ok: v };
}
