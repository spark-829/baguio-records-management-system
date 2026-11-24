import { z } from "zod";
import { csvDocument } from "./csv";
import { manilaDay } from "./arta";

/** ARTA order: Strongly disagree first, Not applicable last. */
export const SCALE = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neither agree nor disagree" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
  { value: 0, label: "Not applicable" },
] as const;

export const ITEMS = [
  { key: "q_satisfied", label: "I am satisfied with the service I received." },
  { key: "q_time", label: "I spent a reasonable amount of time." },
  { key: "q_steps", label: "The steps were easy and simple." },
  { key: "q_fair", label: "I was treated fairly." },
  { key: "q_staff", label: "The staff were polite and helpful." },
] as const;

const answer = z.coerce.number().int().min(0).max(5);
const optAnswer = z.preprocess((v) => (v === undefined || v === "" ? null : v), answer.nullable());
const schema = z.object({
  q_satisfied: answer,
  q_time: optAnswer,
  q_steps: optAnswer,
  q_fair: optAnswer,
  q_staff: optAnswer,
  saw_charter: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : null), z.boolean().nullable()),
  comment: z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, 1000) : ""), z.string()).transform((s) => s || null),
});
export type SurveyValue = z.infer<typeof schema>;

export function parseSurveyForm(entries: Record<string, string | undefined>): { ok: true; value: SurveyValue } | { ok: false; missing: "q_satisfied" } {
  if (entries.q_satisfied === undefined || entries.q_satisfied === "") return { ok: false, missing: "q_satisfied" };
  const r = schema.safeParse(entries);
  return r.success ? { ok: true, value: r.data } : { ok: false, missing: "q_satisfied" };
}

export type SatOffice = {
  office_id: string; office: string; responses: number;
  sat_yes: number; sat_n: number; time_yes: number; time_n: number; steps_yes: number; steps_n: number;
  fair_yes: number; fair_n: number; staff_yes: number; staff_n: number; charter_yes: number; charter_n: number;
};
export type SatReport = { offices: SatOffice[]; comments: { office: string; at: string; comment: string }[] };

export function parseSatisfactionReport(data: unknown): SatReport {
  const d = (data ?? {}) as Partial<SatReport>;
  return { offices: Array.isArray(d.offices) ? d.offices : [], comments: Array.isArray(d.comments) ? d.comments : [] };
}

/** Whole-number percent, or null when nobody answered. */
export const pct = (yes: number, n: number): number | null => (n > 0 ? Math.round((yes / n) * 100) : null);

/** A valid YYYY-MM, or the current Manila month. */
export function monthParam(s?: string, today: string = manilaDay()): string {
  if (s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  return today.slice(0, 7);
}

/** Report for month "YYYY-MM" goes to the City HRMO by the 7th of the next month. */
export function hrmoDeadline(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-07` : `${y}-${String(m + 1).padStart(2, "0")}-07`;
}

export function satisfactionCsv(report: SatReport, month: string): string {
  const p = (y: number, n: number) => { const v = pct(y, n); return v === null ? "" : v; };
  const header = ["Month", "Office", "Responses", "Satisfied %", "Reasonable time %", "Easy steps %", "Treated fairly %", "Polite staff %", "Saw the Charter %"];
  const rows = report.offices.map((o) => [month, o.office, o.responses, p(o.sat_yes, o.sat_n), p(o.time_yes, o.time_n), p(o.steps_yes, o.steps_n), p(o.fair_yes, o.fair_n), p(o.staff_yes, o.staff_n), p(o.charter_yes, o.charter_n)]);
  return csvDocument(header, rows);
}

export type CssState = "sent" | "not_sent" | "late";

/** Monthly summary to HRMO: sent, not sent yet, or late (not sent and the deadline has passed). */
export function cssStatus(o: { sentAt: string | null | undefined; deadline: string; today: string }): CssState {
  if (o.sentAt) return "sent";
  return o.today > o.deadline ? "late" : "not_sent";
}

const CSS_ORDER: Record<CssState, number> = { late: 0, not_sent: 1, sent: 2 };

/** Late first, then not sent, then sent; each group by office name. */
export function sortCssRows<T extends { state: CssState; office: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => CSS_ORDER[a.state] - CSS_ORDER[b.state] || a.office.localeCompare(b.office));
}
