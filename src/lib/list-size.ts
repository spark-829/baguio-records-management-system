/** List size from a `?n=` param: steps of `def`, at least `def`, at most `max`. */
export function listSize(raw: string | string[] | undefined, def: number, max: number): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n) || n < def) return def;
  return Math.min(Math.floor(n / def) * def, max);
}

/** English key for the "N records found" line; the search cannot count cheaply, so a full page reads "N+ ... narrow your search". */
export function foundText(n: number, more: boolean, open: boolean): string {
  if (more) return open ? "{n}+ open records found. Narrow your search or show more." : "{n}+ records found. Narrow your search or show more.";
  if (open) return n === 1 ? "{n} open record found" : "{n} open records found";
  return n === 1 ? "{n} record found" : "{n} records found";
}
