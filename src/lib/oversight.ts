// City-wide (read-only) views for the CMO and CAO heads: parsers for the oversight RPCs.
import type { Status } from "./types";
import { parseSteps, type ServiceStep } from "./charter";

export type CityTotals = { open: number; late: number; due_soon: number; waiting: number };
export type CityOffice = { code: string; name: string; open: number; late: number; waiting: number };
export type CityLate = {
  id: string; tracking_no: string; office_code: string; office: string; due_date: string | null;
  status: string; confidential: boolean; subject: string | null;
};
export type CityOverview = { totals: CityTotals; offices: CityOffice[]; late: CityLate[] };

export type CityRow = {
  id: string; tracking_no: string; subject: string | null; confidential: boolean; status: Status;
  office_code: string; office: string; origin_code: string; due_date: string | null; created_at: string;
};

export type CityHistory = { status: string; from_code: string | null; to_code: string | null; created_at: string; action_taken: string | null };
export type CityRecord = {
  tracking_no: string; direction: string; subject: string | null; confidential: boolean; document_type: string;
  status: string; transaction_type: string | null; arta_class: string | null; due_date: string | null; created_at: string;
  origin_office: string; current_office: string; current_office_code: string; intake_window: boolean;
  service_title: string | null; service_steps: ServiceStep[] | null; history: CityHistory[];
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);

export function parseOverview(data: unknown): CityOverview {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const t = (d.totals && typeof d.totals === "object" ? d.totals : {}) as Record<string, unknown>;
  return {
    totals: { open: num(t.open), late: num(t.late), due_soon: num(t.due_soon), waiting: num(t.waiting) },
    offices: arr(d.offices).map((o) => ({ code: str(o.code), name: str(o.name), open: num(o.open), late: num(o.late), waiting: num(o.waiting) })),
    late: arr(d.late).map((r) => ({
      id: str(r.id), tracking_no: str(r.tracking_no), office_code: str(r.office_code), office: str(r.office),
      due_date: strOrNull(r.due_date), status: str(r.status), confidential: r.confidential === true, subject: strOrNull(r.subject),
    })),
  };
}

export function parseCityRows(data: unknown): CityRow[] {
  return arr(data).map((r) => ({
    id: str(r.id), tracking_no: str(r.tracking_no), subject: strOrNull(r.subject), confidential: r.confidential === true,
    status: str(r.status) as Status, office_code: str(r.office_code), office: str(r.office), origin_code: str(r.origin_code),
    due_date: strOrNull(r.due_date), created_at: str(r.created_at),
  }));
}

export function parseCityRecord(data: unknown): CityRecord | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!str(d.tracking_no)) return null;
  return {
    tracking_no: str(d.tracking_no), direction: str(d.direction), subject: strOrNull(d.subject), confidential: d.confidential === true,
    document_type: str(d.document_type), status: str(d.status), transaction_type: strOrNull(d.transaction_type),
    arta_class: strOrNull(d.arta_class), due_date: strOrNull(d.due_date), created_at: str(d.created_at),
    origin_office: str(d.origin_office), current_office: str(d.current_office), current_office_code: str(d.current_office_code),
    intake_window: d.intake_window === true, service_title: strOrNull(d.service_title), service_steps: parseSteps(d.service_steps),
    history: arr(d.history).map((h) => ({
      status: str(h.status), from_code: strOrNull(h.from_code), to_code: strOrNull(h.to_code), created_at: str(h.created_at),
      action_taken: strOrNull(h.action_taken),
    })),
  };
}

/** Subject for a city row; confidential records show who holds them instead. */
export function maskedSubject(row: { confidential: boolean; subject: string | null; office: string }, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (row.confidential) return t("Confidential record held by {office}", { office: row.office });
  return row.subject ?? "";
}
