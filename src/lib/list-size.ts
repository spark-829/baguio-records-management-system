/** List size from a `?n=` param: steps of `def`, at least `def`, at most `max`. */
export function listSize(raw: string | string[] | undefined, def: number, max: number): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < def) return def;
  return Math.min(Math.floor(n / def) * def, max);
}
