/** Old document type names still accepted (AI answers, old data). Key: lower case. */
export const LEGACY_TYPE_NAMES: ReadonlyMap<string, string> = new Map([["request / complaint", "Request"]]);

/** The listed type matching `name` (case and spaces ignored), or the current name of an old type. */
export function matchDocType(name: string | null | undefined, docTypes: readonly string[]): string | undefined {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return undefined;
  const exact = docTypes.find((t) => t.toLowerCase() === key);
  if (exact) return exact;
  const alias = LEGACY_TYPE_NAMES.get(key)?.toLowerCase();
  return alias ? docTypes.find((t) => t.toLowerCase() === alias) : undefined;
}

/** "ADM-COR · Correspondence ..." or "" when the type has no file plan code. */
export function seriesLabel(t: { series_code?: string | null; series_title?: string | null } | null | undefined): string {
  const code = t?.series_code?.trim();
  if (!code) return "";
  const title = t?.series_title?.trim();
  return title ? `${code} · ${title}` : code;
}
