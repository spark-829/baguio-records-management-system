/** Pure logic for the administrator's System analytics page. */

export type Period = 30 | 90 | 365;
export type View = "sent" | "days";

const first = (raw: unknown) => (Array.isArray(raw) ? raw[0] : raw);

export function periodDays(raw: unknown): Period {
  const v = first(raw);
  return v === "30" ? 30 : v === "365" ? 365 : 90;
}

export function viewMode(raw: unknown): View {
  return first(raw) === "days" ? "days" : "sent";
}

/** Keys for t(). */
export const periodNoun = (days: Period) => (days === 30 ? "30 days" : days === 90 ? "90 days" : "12 months");
export const periodLabel = (days: Period) => (days === 30 ? "Last 30 days" : days === 90 ? "Last 90 days" : "Last 12 months");

export interface OfficeFlow {
  id: string;
  code: string;
  name: string;
  visits: number;
  records: number;
  waitDays: number;
  transitDays: number;
  medianWait: number | null;
  p90Wait: number | null;
  medianHandoff: number | null;
}
export interface OpenOffice {
  officeId: string;
  under1w: number;
  w1to2: number;
  w2to4: number;
  over4w: number;
  pastDue: number;
  oldest: { id: string; trackingNo: string; days: number } | null;
}
export interface Handoff { from: string; to: string; sent: number; medianDays: number | null }
export interface TrendPoint { start: string; logged: number; finished: number }
export interface FlowData {
  asOf: string;
  days: Period;
  grain: "week" | "month";
  since: string;
  logged: number;
  openNow: number;
  prevOpen: number;
  strip: {
    finished: number;
    prevFinished: number;
    medianFinish: number | null;
    prevMedianFinish: number | null;
    withDue: number;
    onTime: number;
    prevWithDue: number;
    prevOnTime: number;
  };
  offices: OfficeFlow[];
  openOffices: OpenOffice[];
  handoffs: Handoff[];
  trend: TrendPoint[];
  returns: { recordsMoved: number; recordsReturned: number; offices: { officeId: string; returns: number; arrivals: number }[] };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) => Number(x) || 0;
const numOrNull = (x: unknown) => (x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
const str = (x: unknown) => (typeof x === "string" ? x : "");
const list = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);

export function parseFlow(raw: unknown): FlowData | null {
  if (!isObj(raw)) return null;
  const s = isObj(raw.strip) ? raw.strip : {};
  const r = isObj(raw.returns) ? raw.returns : {};
  return {
    asOf: str(raw.as_of),
    days: periodDays(String(raw.days)),
    grain: raw.grain === "month" ? "month" : "week",
    since: str(raw.since),
    logged: num(raw.logged),
    openNow: num(raw.open_now),
    prevOpen: num(raw.prev_open),
    strip: {
      finished: num(s.finished),
      prevFinished: num(s.prev_finished),
      medianFinish: numOrNull(s.median_finish),
      prevMedianFinish: numOrNull(s.prev_median_finish),
      withDue: num(s.with_due),
      onTime: num(s.on_time),
      prevWithDue: num(s.prev_with_due),
      prevOnTime: num(s.prev_on_time),
    },
    offices: list(raw.offices).map((o) => ({
      id: str(o.id),
      code: str(o.code),
      name: str(o.name),
      visits: num(o.visits),
      records: num(o.records),
      waitDays: num(o.wait_days),
      transitDays: num(o.transit_days),
      medianWait: numOrNull(o.median_wait),
      p90Wait: numOrNull(o.p90_wait),
      medianHandoff: numOrNull(o.median_handoff),
    })),
    openOffices: list(raw.open_offices).map((o) => {
      const old = isObj(o.oldest) ? o.oldest : null;
      return {
        officeId: str(o.office_id),
        under1w: num(o.under_1w),
        w1to2: num(o.w1_2),
        w2to4: num(o.w2_4),
        over4w: num(o.over_4w),
        pastDue: num(o.past_due),
        oldest: old ? { id: str(old.id), trackingNo: str(old.tracking_no), days: num(old.days) } : null,
      };
    }),
    handoffs: list(raw.handoffs).map((h) => ({ from: str(h.from), to: str(h.to), sent: num(h.sent), medianDays: numOrNull(h.median_days) })),
    trend: list(raw.trend).map((p) => ({ start: str(p.start), logged: num(p.logged), finished: num(p.finished) })),
    returns: {
      recordsMoved: num(r.records_moved),
      recordsReturned: num(r.records_returned),
      offices: list(r.offices).map((o) => ({ officeId: str(o.office_id), returns: num(o.returns), arrivals: num(o.arrivals) })),
    },
  };
}

export type RankedOffice = OfficeFlow & { share: number; deskPct: number; transitPct: number };

/** Offices ranked by their share of all waiting time. Offices with no visits go last, by name. */
export function rankOffices(offices: OfficeFlow[]): RankedOffice[] {
  const total = offices.reduce((a, o) => a + o.waitDays, 0);
  const ranked = offices.map((o) => ({
    ...o,
    share: total ? (o.waitDays / total) * 100 : 0,
    deskPct: total ? ((o.waitDays - o.transitDays) / total) * 100 : 0,
    transitPct: total ? (o.transitDays / total) * 100 : 0,
  }));
  return ranked.sort((a, b) => {
    const aEmpty = a.visits === 0;
    const bEmpty = b.visits === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (aEmpty) return a.name.localeCompare(b.name);
    return b.share - a.share;
  });
}

/** The 4 cut values between 5 equal groups of the positive values (nearest rank), or [] with no values. */
export function quintileCuts(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map((p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))]);
}

export function quintileIndex(v: number, cuts: number[]): number {
  return cuts.filter((c) => v > c).length;
}

export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const k = Math.floor(Math.log10(max));
  let step = 0;
  for (let e = k - 1; e <= k + 2 && !step; e++) {
    for (const m of [1, 2, 5]) {
      const s = m * 10 ** e;
      if (Math.ceil(max / s) <= 4) { step = s; break; }
    }
  }
  const n = Math.ceil(max / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/**
 * Drops the first and last buckets: the first starts before the period and the last is still running,
 * so both hold only part of a week or month and would dip on the chart (Jira and GA mark or drop these too).
 */
export function fullBuckets<T>(points: T[]): T[] {
  return points.length > 2 ? points.slice(1, -1) : points;
}

export function labelIndexes(n: number, maxLabels = 6): number[] {
  if (n <= 0) return [];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < maxLabels; i++) out.add(Math.round((i * (n - 1)) / (maxLabels - 1)));
  return [...out].sort((a, b) => a - b);
}

export function dayText(d: number | null): { key: string; vars: Record<string, number> } | null {
  if (d === null) return null;
  if (d < 1) return { key: "less than a day", vars: {} };
  const n = Math.round(d);
  return { key: n === 1 ? "{n} day" : "{n} days", vars: { n } };
}

export function findingText(
  top: { visits: number; share: number } | null | undefined,
): { key: string; vars: Record<string, number | string> } {
  if (!top || top.visits < 5 || top.share === 0) {
    return { key: "Too few records moved in this period to rank offices. Try a longer period.", vars: {} };
  }
  return {
    key: "Records wait longest at {office}: {share}% of all waiting time in the last {period}, usually {days} each.",
    vars: { share: Math.round(top.share) },
  };
}

export function pileText(logged: number, finished: number): { key: string; vars: Record<string, number> } {
  const diff = logged - finished;
  const vars = { logged, finished, n: Math.abs(diff) };
  if (diff > 0) return { key: "{logged} logged, {finished} finished: the open pile grew by {n}.", vars };
  if (diff < 0) return { key: "{logged} logged, {finished} finished: the open pile shrank by {n}.", vars };
  return { key: "{logged} logged, {finished} finished: the open pile stayed the same.", vars };
}

export function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function perWeek(n: number, days: number): number {
  return Math.round((n / (days / 7)) * 10) / 10;
}
