import { filtersFromParams, filtersToParams } from "./search";
import { listSize } from "./list-size";
import type { SearchFilters } from "./types";

const PAGE = 50;
const MAX = 500;

/** Records list query string: known filters only, plus `n` when the list was grown past one page. "" when nothing is set. */
export function listQuery(f: SearchFilters, n: number): string {
  const p = filtersToParams(f);
  if (n > PAGE) p.set("n", String(n));
  return p.toString();
}

/** Cleans a record page's `?back=`: unknown keys are dropped and values are re-encoded, so it can only ever be a /records query. */
export function backQuery(back: string | string[] | undefined): string {
  const raw = (Array.isArray(back) ? back[0] : back) ?? "";
  if (!raw || raw.length > 2000) return "";
  const sp = Object.fromEntries(new URLSearchParams(raw));
  return listQuery(filtersFromParams(sp), listSize(sp.n, PAGE, MAX));
}

/** Where "Back" goes from a record: always `/records` or `/records?…` (no open redirect). */
export function recordsBackHref(back: string | string[] | undefined): string {
  const qs = backQuery(back);
  return qs ? `/records?${qs}` : "/records";
}
