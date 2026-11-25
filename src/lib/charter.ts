// Citizen's Charter services: pure helpers for the catalog in Register and the steps on a record.
import { artaDue, isArtaClass, type ArtaClass } from "./arta";
import { officeMinutesBetween } from "./step-times";
import { matchDocType } from "./doc-types";
import type { Role, Status } from "./types";

export type ServiceOpt = {
  id: string;
  office_id: string;
  title: string;
  classification: string;
  tx_types: string[];
  fee_text: string | null;
  fee_php: number | null;
  total_text: string | null;
  total_minutes: number | null;
  confidential: boolean;
  doc_type_name: string;
  sort_order?: number;
};

export type ServiceStep = {
  n: number;
  action: string;
  by: string | null;
  minutes: number | null;
  done_at?: string | null;
  done_by?: string | null;
  route_id?: string | null;
};

/** The ARTA class stored on a record for a charter classification ("simple", "complex", "highly_technical"). */
export function artaFromCharter(c: string | null | undefined): ArtaClass {
  return isArtaClass(c) ? c : "none";
}

/** The first transaction type listed for the service. */
export function primaryTx(s: Pick<ServiceOpt, "tx_types">): string | null {
  return s.tx_types[0] ?? null;
}

/** Short fee text for the catalog: "No fee", "₱150" or "Fee per ordinance". */
export function feeShort(s: Pick<ServiceOpt, "fee_php" | "fee_text">): string {
  if (s.fee_php === 0 || /^none/i.test((s.fee_text ?? "").trim())) return "No fee";
  if (s.fee_php != null && s.fee_php > 0) return `₱${s.fee_php.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
  return "Fee per ordinance";
}

const RADIO_ALL = 8;
const RADIO_TOP = 5;

/** A sorted copy: most used first, ties by catalog order. */
export function rankByUse<T extends Pick<ServiceOpt, "id"> & { sort_order?: number }>(
  services: T[],
  counts: Record<string, number>,
): T[] {
  return [...services].sort(
    (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
}

/** Up to 8 services: all as radios. More: the 5 most used as radios (ties by catalog order), the rest for the select. */
export function splitCatalog<T extends Pick<ServiceOpt, "id"> & { sort_order?: number }>(
  services: T[],
  counts: Record<string, number>,
): { radios: T[]; rest: T[] } {
  if (services.length <= RADIO_ALL) return { radios: services, rest: [] };
  const ranked = rankByUse(services, counts);
  const top = new Set(ranked.slice(0, RADIO_TOP).map((s) => s.id));
  return { radios: ranked.slice(0, RADIO_TOP), rest: services.filter((s) => !top.has(s.id)) };
}

/** Records desk: the n most used services as radios, the rest (in catalog order) in the select. */
export function topServices<T extends Pick<ServiceOpt, "id"> & { sort_order?: number }>(
  services: T[],
  counts: Record<string, number>,
  n = 3,
): { radios: T[]; rest: T[] } {
  const radios = rankByUse(services, counts).slice(0, n);
  const top = new Set(radios.map((s) => s.id));
  return { radios, rest: services.filter((s) => !top.has(s.id)) };
}

/** What picking a service fills in on the Register form. */
export function prefillFromService(
  s: ServiceOpt,
  types: { id: string; name: string }[],
  today: string,
): { document_type_id: string; transaction_type: string; arta_class: ArtaClass; due_date: string; confidentiality?: "confidential" } {
  const names = types.map((x) => x.name);
  const wanted = matchDocType(s.doc_type_name, names) ?? "Letter";
  const type = types.find((x) => x.name === wanted);
  const cls = artaFromCharter(s.classification);
  return {
    document_type_id: type?.id ?? "",
    transaction_type: primaryTx(s) ?? "",
    arta_class: cls,
    due_date: artaDue(cls, today) ?? "",
    confidentiality: s.confidential ? "confidential" : undefined,
  };
}

export type StepRow = {
  n: number;
  action: string;
  by: string | null;
  minutes: number | null;
  state: "done" | "next" | "todo";
  took: number | null;
  slow: boolean;
};

/** Rows for the Charter steps card. Step 1 is never slow; a step without a standard is never slow. */
export function stepsView(
  steps: ServiceStep[],
  nowIso: string,
): { rows: StepRow[]; spent: number; standard: number; over: boolean; allDone: boolean } {
  const rows: StepRow[] = [];
  let spent = 0;
  let prevDone: string | null = null;
  let nextSeen = false;
  for (const s of steps) {
    if (s.done_at) {
      const took = prevDone ? officeMinutesBetween(prevDone, s.done_at) : 0;
      rows.push({ n: s.n, action: s.action, by: s.by, minutes: s.minutes, state: "done", took, slow: s.n > 1 && s.minutes != null && took > s.minutes });
      spent += took;
      prevDone = s.done_at;
    } else if (!nextSeen) {
      nextSeen = true;
      const waiting = prevDone ? officeMinutesBetween(prevDone, nowIso) : 0;
      spent += waiting;
      rows.push({ n: s.n, action: s.action, by: s.by, minutes: s.minutes, state: "next", took: null, slow: false });
    } else {
      rows.push({ n: s.n, action: s.action, by: s.by, minutes: s.minutes, state: "todo", took: null, slow: false });
    }
  }
  const standard = steps.reduce((a, s) => a + (s.minutes ?? 0), 0);
  return { rows, spent, standard, over: standard > 0 && spent > standard, allDone: steps.length > 0 && !nextSeen };
}

/** History rows (route id) of ticks that took longer than the charter standard. */
export function charterSlowByRoute(steps: ServiceStep[] | null | undefined): Record<string, { took: number; standard: number }> {
  const out: Record<string, { took: number; standard: number }> = {};
  let prevDone: string | null = null;
  for (const s of steps ?? []) {
    if (!s.done_at) break;
    if (prevDone && s.route_id && s.minutes != null) {
      const took = officeMinutesBetween(prevDone, s.done_at);
      if (took > s.minutes) out[s.route_id] = { took, standard: s.minutes };
    }
    prevDone = s.done_at;
  }
  return out;
}

/** Mirror of rms_mark_charter_step (mark). The database decides; this only shows or hides the button. */
export function canMarkStep(o: {
  /** true: ignore "all steps done" (used for the Undo button) */
  ignoreDone?: boolean;
  role: Role;
  meId: string;
  meOfficeId: string | null;
  windowFlag?: boolean | null;
  record: { status: Status; current_office_id: string; assigned_to: string | null; service_steps: ServiceStep[] | null };
}): boolean {
  const r = o.record;
  if (!r.service_steps || (!o.ignoreDone && r.service_steps.every((s) => s.done_at))) return false;
  if (o.role === "admin" || o.role === "viewer") return false;
  if (!["registered", "received", "under_action"].includes(r.status)) return false;
  if (!o.meOfficeId || o.meOfficeId !== r.current_office_id) return false;
  return r.assigned_to === o.meId || o.role === "dept_head" || o.role === "records_officer" || (o.role === "staff" && !!o.windowFlag);
}

export const UNDO_MINUTES = 10;

/** Mirror of the undo rule: the last done step, not step 1, done by me, within 10 minutes. */
export function canUndoStep(steps: ServiceStep[], n: number, meId: string, now: Date | number = Date.now()): boolean {
  const done = steps.filter((s) => s.done_at);
  const last = done[done.length - 1];
  if (!last || last.n !== n || n <= 1) return false;
  if (last.done_by !== meId || !last.done_at) return false;
  return Date.parse(last.done_at) > new Date(now).getTime() - UNDO_MINUTES * 60_000;
}

/** Steps from the database (jsonb), tolerant of junk. */
export function parseSteps(v: unknown): ServiceStep[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: ServiceStep[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.n !== "number" || typeof o.action !== "string") continue;
    out.push({
      n: o.n,
      action: o.action,
      by: typeof o.by === "string" ? o.by : null,
      minutes: typeof o.minutes === "number" ? o.minutes : null,
      done_at: typeof o.done_at === "string" ? o.done_at : null,
      done_by: typeof o.done_by === "string" ? o.done_by : null,
      route_id: typeof o.route_id === "string" ? o.route_id : null,
    });
  }
  return out.length ? out.sort((a, b) => a.n - b.n) : null;
}

const UNIT_KEYS: Record<string, [string, string]> = {
  second: ["{n} second", "{n} seconds"],
  minute: ["{n} minute", "{n} minutes"],
  hour: ["{n} hour", "{n} hours"],
  day: ["{n} day", "{n} days"],
  "working day": ["{n} working day", "{n} working days"],
  month: ["{n} month", "{n} months"],
  year: ["{n} year", "{n} years"],
};

/** Charter durations ("1 hour 45 minutes", "22 minutes per document") through the translator, unit by unit. */
export function durationText(text: string | null | undefined, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (!text) return "";
  return text
    .replace(/(\d[\d,]*)\s+(working day|second|minute|hour|day|month|year)s?\b/g, (_m, n: string, unit: string) => {
      const [one, many] = UNIT_KEYS[unit];
      return t(n === "1" ? one : many, { n });
    })
    .replace(/\bper document\b/, t("per document"));
}
