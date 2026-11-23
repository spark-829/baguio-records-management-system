import type { RetentionState } from "./retention";

export type Count = { key: string; n: number };

export type ReportSummary = {
  total: number;
  incoming: number;
  outgoing: number;
  open: number;
  overdue: number;
  by_status: Count[];
  by_office: Count[];
  by_type: Count[];
  by_month: Count[];
  overdue_rows: { id: string; tracking_no: string; subject: string; due_date: string | null; created_at: string; office: string | null }[];
};

export type RetentionRow = {
  id: string;
  tracking_no: string;
  subject: string;
  status: string;
  type_name: string | null;
  years: number;
  office_name: string | null;
  finished_at: string;
  keep_until: string | null;
  state: RetentionState;
  created_at: string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateMs(v: string | undefined | null) {
  if (!v || !DATE_ONLY.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** Report date filters as UTC instants: `from` is that day's start, `to` is the start of the day after it. Bad input gives null. */
export function reportBounds(from?: string, to?: string): { from: string | null; to: string | null } {
  const f = dateMs(from);
  const e = dateMs(to);
  return {
    from: f === null ? null : `${from}T00:00:00.000Z`,
    to: e === null ? null : new Date(e + 864e5).toISOString(),
  };
}

/** "2026-11" -> "Nov 2026" */
export function monthLabel(ym: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T00:00:00Z`));
}

/** Maps keys to labels, merges equal labels, and sorts biggest first (ties keep their order). */
export function toBars(items: Count[], label: (key: string) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const l = label(it.key);
    m.set(l, (m.get(l) ?? 0) + it.n);
  }
  return [...m].map(([l, n]) => ({ label: l, n })).sort((a, b) => b.n - a.n);
}

const num = (x: unknown) => Number(x) || 0;
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const counts = (x: unknown): Count[] => arr<{ key: unknown; n: unknown }>(x).map((c) => ({ key: String(c.key), n: num(c.n) }));

export function parseSummary(data: unknown): ReportSummary {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    total: num(d.total),
    incoming: num(d.incoming),
    outgoing: num(d.outgoing),
    open: num(d.open),
    overdue: num(d.overdue),
    by_status: counts(d.by_status),
    by_office: counts(d.by_office),
    by_type: counts(d.by_type),
    by_month: counts(d.by_month),
    overdue_rows: arr(d.overdue_rows),
  };
}

export function parseRetention(data: unknown): { counts: Record<RetentionState, number>; rows: RetentionRow[] } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    counts: { review_now: num(d.review_now), review_soon: num(d.review_soon), keep: num(d.keep) },
    rows: arr<RetentionRow>(d.rows),
  };
}

export type OnTimeRow = { id: string; name: string; finished: number; on_time: number };

export function parseOnTime(data: unknown): OnTimeRow[] {
  return arr<Record<string, unknown>>(data)
    .filter((r) => r && typeof r === "object")
    .map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? ""), finished: num(r.finished), on_time: num(r.on_time) }))
    .filter((r) => r.finished > 0);
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function onTimeSummary(rows: OnTimeRow[]) {
  const finished = rows.reduce((s, r) => s + r.finished, 0);
  const on_time = rows.reduce((s, r) => s + r.on_time, 0);
  const offices = rows
    .map((r) => ({ ...r, pct: percent(r.on_time, r.finished) ?? 0 }))
    .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  return { finished, on_time, pct: percent(on_time, finished), offices };
}
