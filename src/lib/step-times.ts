/** Standard minutes per step (Citizen's Charter, GSO Service 15) and "Slow" flags for the history. Pure, no DOM. */
import { isWorkingDay } from "./arta";

export const STEP_KEYS = ["register", "forward", "receive", "assign", "act"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type StepMinutes = Partial<Record<StepKey, number>>;

export const CHARTER_MINUTES: Record<StepKey, number> = { register: 9, forward: 5, receive: 5, assign: 5, act: 5 };

export const STEP_LABEL: Record<StepKey, string> = {
  register: "Register and give receiving copy",
  forward: "Send to another office",
  receive: "Mark as received",
  assign: "Assign to a person",
  act: "Start working on it",
};

const validMinutes = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 600;

/** Keep only known keys with valid values. Missing or non-object input gives the charter times. */
export function parseStepMinutes(v: unknown): StepMinutes {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...CHARTER_MINUTES };
  const out: StepMinutes = {};
  for (const k of STEP_KEYS) {
    const n = (v as Record<string, unknown>)[k];
    if (validMinutes(n)) out[k] = n;
  }
  return out;
}

/** Form entries (key -> text). A blank field removes that key. */
export function validateStepForm(entries: Record<string, string>): { ok: true; minutes: StepMinutes } | { error: "Type minutes from 1 to 600." } {
  const minutes: StepMinutes = {};
  for (const k of STEP_KEYS) {
    const raw = (entries[k] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!validMinutes(n)) return { error: "Type minutes from 1 to 600." };
    minutes[k] = n;
  }
  return { ok: true, minutes };
}

type RouteLike = { id?: string; status: string; assigned_to?: string | null; from_office_id?: string | null; to_office_id?: string | null; created_at: string };

export function stepKind(route: RouteLike, prev?: RouteLike | null): StepKey | null {
  if (route.assigned_to) return "assign";
  if (route.status === "forwarded" && route.from_office_id !== route.to_office_id) return "forward";
  if (route.status === "received" && prev?.status === "forwarded") return "receive";
  if (route.status === "under_action" && prev?.status !== "under_action") return "act";
  return null;
}

const DAY_MS = 86_400_000;
const MANILA_MS = 8 * 3_600_000;
const OPEN_MIN = 8 * 60;
const CLOSE_MIN = 17 * 60;
const MAX_DAYS = 120;

/** Minutes between two instants that fall in office hours (Mon-Fri 08:00-17:00 Manila, holidays skipped). */
export function officeMinutesBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso) + MANILA_MS;
  const b = Date.parse(bIso) + MANILA_MS;
  if (!(b > a)) return 0;
  let total = 0;
  let dayStart = Math.floor(a / DAY_MS) * DAY_MS;
  for (let i = 0; i < MAX_DAYS && dayStart < b; i++, dayStart += DAY_MS) {
    const day = new Date(dayStart).toISOString().slice(0, 10);
    if (!isWorkingDay(day)) continue;
    const from = Math.max(a, dayStart + OPEN_MIN * 60_000);
    const to = Math.min(b, dayStart + CLOSE_MIN * 60_000);
    if (to > from) total += Math.round((to - from) / 60_000);
  }
  return total;
}

/** oldestFirst history. Flags steps that took longer than the standard. Registration (the first step) is never flagged. */
export function slowSteps(oldestFirst: RouteLike[], standards: StepMinutes): Record<string, { took: number; standard: number }> {
  const out: Record<string, { took: number; standard: number }> = {};
  for (let i = 1; i < oldestFirst.length; i++) {
    const r = oldestFirst[i];
    const kind = stepKind(r, oldestFirst[i - 1]);
    const standard = kind ? standards[kind] : undefined;
    if (!kind || !standard || !r.id) continue;
    const took = officeMinutesBetween(oldestFirst[i - 1].created_at, r.created_at);
    if (took > standard) out[r.id] = { took, standard };
  }
  return out;
}

export function fmtMinutes(n: number): { key: "{h} h {m} min" | "{m} min"; vars: Record<string, number> } {
  const m = Math.max(0, Math.round(n));
  return m >= 60 ? { key: "{h} h {m} min", vars: { h: Math.floor(m / 60), m: m % 60 } } : { key: "{m} min", vars: { m } };
}
