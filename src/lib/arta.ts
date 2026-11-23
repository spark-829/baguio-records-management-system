// ARTA (RA 11032, Sec. 9) processing times; UX reference: Shopee/Lazada delivery estimate that fills in when you pick a shipping option.
import { utc } from "./due";

export type ArtaClass = "simple" | "complex" | "highly_technical" | "none";
export const ARTA_CLASSES: readonly ArtaClass[] = ["simple", "complex", "highly_technical", "none"];
export const ARTA_DAYS = { simple: 3, complex: 7, highly_technical: 20 } as const;
export const ARTA_LABEL: Record<ArtaClass, string> = {
  simple: "Simple (3 working days)",
  complex: "Complex (7 working days)",
  highly_technical: "Highly technical (20 working days)",
  none: "No deadline",
};

export function isArtaClass(x: unknown): x is ArtaClass {
  return typeof x === "string" && (ARTA_CLASSES as readonly string[]).includes(x);
}

/** Today (or the given moment) as a Manila "YYYY-MM-DD". */
export function manilaDay(at: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(typeof at === "string" ? new Date(at) : at);
}

const addDays = (s: string, n: number) => new Date(utc(s).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Same fixed list as rms_seed_off_day in the database (MM-DD).
const FIXED = new Set(["01-01", "02-25", "04-09", "05-01", "06-12", "08-21", "09-01", "11-01", "11-30", "12-08", "12-25", "12-30", "12-31"]);

/** Special non-working days from the yearly Proclamation, YYYY-MM-DD. */
export const PROCLAIMED_DAYS = new Set<string>([]);

const moving = new Map<number, Set<string>>();
function movingDays(y: number): Set<string> {
  let s = moving.get(y);
  if (!s) {
    const easter = easterSunday(y);
    const aug31 = `${y}-08-31`;
    // National Heroes Day: last Monday of August (RA 9492)
    const heroes = addDays(aug31, -((utc(aug31).getUTCDay() + 6) % 7));
    s = new Set([addDays(easter, -3), addDays(easter, -2), heroes]);
    moving.set(y, s);
  }
  return s;
}

export function isWorkingDay(day: string): boolean {
  const dow = utc(day).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (FIXED.has(day.slice(5)) || PROCLAIMED_DAYS.has(day)) return false;
  return !movingDays(Number(day.slice(0, 4))).has(day);
}

/** The date N working days after start. The start day itself is not counted. */
export function addWorkingDays(start: string, n: number): string {
  let left = Math.min(Math.max(Math.trunc(n) || 0, 0), 366);
  let d = start;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** Working days in (from, to]; 0 if to <= from. */
export function workingDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return n;
}

export function artaDue(cls: ArtaClass, registered: string): string | null {
  return cls === "none" ? null : addWorkingDays(registered, ARTA_DAYS[cls]);
}

export type ArtaProgress =
  | { kind: "on_track" | "done_on_time"; day: number; n: number }
  | { kind: "late" | "done_late"; late: number; n: number };

export function artaProgress(o: { registered: string; due: string; asOf: string; finished: boolean }): ArtaProgress {
  const n = workingDaysBetween(o.registered, o.due);
  if (o.asOf > o.due) return { kind: o.finished ? "done_late" : "late", late: Math.max(1, workingDaysBetween(o.due, o.asOf)), n };
  return { kind: o.finished ? "done_on_time" : "on_track", day: workingDaysBetween(o.registered, o.asOf), n };
}

function fill(s: string, v: Record<string, string | number> = {}) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
}

export function artaText(p: ArtaProgress, t: (s: string, v?: Record<string, string | number>) => string = fill): string {
  switch (p.kind) {
    case "on_track":
      return p.day === 0 ? t("Registered today. {n} working days to act.", { n: p.n }) : t("Working day {x} of {n}", { x: p.day, n: p.n });
    case "done_on_time":
      return t("Finished on working day {x} of {n}", { x: p.day, n: p.n });
    case "late":
      return t(p.late === 1 ? "{n} working day late" : "{n} working days late", { n: p.late });
    case "done_late":
      return t(p.late === 1 ? "Finished {n} working day late" : "Finished {n} working days late", { n: p.late });
  }
}
