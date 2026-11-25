/** Sending out and delivery of outgoing records. Mirrors rms_release_record, rms_record_delivery and rms_report_released. */
import type { Role, Status } from "./types";

export const SEND_METHODS = ["registered_mail", "courier", "hand", "email", "other"] as const;
export type SendMethod = (typeof SEND_METHODS)[number];

export const METHOD_LABEL: Record<SendMethod, string> = {
  registered_mail: "Registered mail (PHLPost)",
  courier: "Courier (LBC, J&T and others)",
  hand: "Hand delivery",
  email: "Email",
  other: "Other",
};

export const COURIERS = ["LBC", "J&T Express", "2GO", "Ninja Van"];

const TRACKING_RE = /^[A-Z0-9-]{4,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DAY = "2000-01-01";

export const needsTracking = (m: string): boolean => m === "registered_mail" || m === "courier";
export const normalizeTracking = (s: unknown): string => String(s ?? "").toUpperCase().replace(/\s+/g, "");

const isSendMethod = (m: unknown): m is SendMethod => (SEND_METHODS as readonly string[]).includes(String(m));

/** A real calendar day written YYYY-MM-DD. */
export function isDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The words after "Sent out by" in the history (same as the database). */
export function historyHow(method: string, courier: string | null | undefined): string {
  switch (method) {
    case "registered_mail":
      return "Registered mail (PHLPost)";
    case "courier":
      return String(courier ?? "").trim().slice(0, 60) || "courier";
    case "hand":
      return "hand delivery";
    case "email":
      return "email";
    default:
      return "other means";
  }
}

export function sentOutText(method: string, courier: string | null | undefined, tracking: string | null | undefined): string {
  return `Sent out by ${historyHow(method, courier)}${tracking ? `, tracking ${tracking}` : ""}`;
}

export type ReleaseValue = { method: SendMethod; courier: string | null; tracking: string | null; sentOn: string };
export type ReleaseErrors = Partial<Record<"method" | "tracking" | "sentOn", string>>;

export function parseReleaseForm(
  i: Record<string, unknown>,
  today: string,
): { ok: true; value: ReleaseValue } | { ok: false; errors: ReleaseErrors } {
  const errors: ReleaseErrors = {};
  const method = String(i.method ?? "");
  let tracking: string | null = null;
  let courier: string | null = null;
  if (!isSendMethod(method)) {
    errors.method = "Choose how it was sent";
  } else if (needsTracking(method)) {
    const tn = normalizeTracking(i.tracking);
    if (!TRACKING_RE.test(tn)) errors.tracking = "Enter the tracking number from the receipt";
    else tracking = tn;
    if (method === "courier") courier = String(i.courier ?? "").trim().slice(0, 60) || null;
  }
  const sentOn = String(i.sentOn ?? "").trim();
  if (!isDay(sentOn) || sentOn < MIN_DAY) errors.sentOn = "Enter the date sent";
  else if (sentOn > today) errors.sentOn = "The date sent cannot be in the future.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { method: method as SendMethod, courier, tracking, sentOn } };
}

export type DeliveryValue = { receivedBy: string; receivedOn: string; note: string | null };
export type DeliveryErrors = Partial<Record<"receivedBy" | "receivedOn", string>>;

export function parseDeliveryForm(
  i: Record<string, unknown>,
  sentOn: string,
  today: string,
): { ok: true; value: DeliveryValue } | { ok: false; errors: DeliveryErrors } {
  const errors: DeliveryErrors = {};
  const receivedBy = String(i.receivedBy ?? "").trim();
  if (receivedBy.length < 2 || receivedBy.length > 200) errors.receivedBy = "Type the name of the person who received it.";
  const receivedOn = String(i.receivedOn ?? "").trim();
  if (!isDay(receivedOn)) errors.receivedOn = "Enter the date received";
  else if (receivedOn < sentOn) errors.receivedOn = "The date received cannot be before the date sent.";
  else if (receivedOn > today) errors.receivedOn = "The date received cannot be in the future.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { receivedBy, receivedOn, note: String(i.note ?? "").trim().slice(0, 1000) || null } };
}

/** Who may record delivery: the records desk, or staff of the sending or holding office, while the record is sent out. */
export function canRecordDelivery(a: {
  role: Role;
  userOfficeId: string | null;
  originOfficeId: string;
  currentOfficeId: string;
  status: Status;
  deleted: boolean;
  received: boolean;
}): boolean {
  if (a.deleted || a.received || a.status !== "released") return false;
  if (a.role === "records_officer") return true;
  if (a.role !== "dept_head" && a.role !== "staff") return false;
  return a.userOfficeId !== null && (a.userOfficeId === a.originOfficeId || a.userOfficeId === a.currentOfficeId);
}

/** The text of the first error, in field order. */
export function firstError(errors: Record<string, string | undefined>): string {
  return Object.values(errors).find(Boolean) ?? "";
}

const RELEASE_ERRORS: [RegExp, string][] = [
  [/choose how it was sent/i, "Choose how it was sent"],
  [/tracking number/i, "Enter the tracking number from the receipt"],
  [/enter the date sent/i, "Enter the date sent"],
  [/date sent cannot be in the future/i, "The date sent cannot be in the future."],
  [/already sent out/i, "This record was already sent out."],
  [/only a record the city sends out/i, "Only a record the City sends out can be marked as sent out."],
  [/only the records desk or the office holding/i, "Only the office holding this record, or the records desk, can act on it."],
  [/that step is not allowed/i, "That action is not available for this record."],
  [/record not found/i, "Record not found"],
];

const DELIVERY_ERRORS: [RegExp, string][] = [
  [/delivery is already recorded/i, "Delivery is already recorded."],
  [/only while the record is sent out|no sending record/i, "Delivery can be recorded only while the record is sent out."],
  [/sending office/i, "Only the records desk or the sending office can record delivery."],
  [/type the name of the person/i, "Type the name of the person who received it."],
  [/enter the date received/i, "Enter the date received"],
  [/before the date sent/i, "The date received cannot be before the date sent."],
  [/date received cannot be in the future/i, "The date received cannot be in the future."],
  [/record not found/i, "Record not found"],
];

const mapError = (table: [RegExp, string][], msg: string) => table.find(([re]) => re.test(msg))?.[1] ?? msg;
export const releaseErrorText = (msg: string): string => mapError(RELEASE_ERRORS, msg);
export const deliveryErrorText = (msg: string): string => mapError(DELIVERY_ERRORS, msg);

export type LogbookRow = {
  record_id: string;
  tracking_no: string;
  subject: string;
  recipient: string;
  office_code: string;
  office_name: string;
  method: string;
  courier: string | null;
  courier_tracking: string | null;
  sent_on: string;
  sent_at: string;
  sent_by: string | null;
  received_by: string | null;
  received_on: string | null;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Rows from rms_report_released; anything that is not a row with a record number is dropped. */
export function parseLogbook(data: unknown): LogbookRow[] {
  if (!Array.isArray(data)) return [];
  const rows: LogbookRow[] = [];
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.tracking_no !== "string" || !o.tracking_no) continue;
    rows.push({
      record_id: str(o.record_id),
      tracking_no: o.tracking_no,
      subject: str(o.subject),
      recipient: str(o.recipient),
      office_code: str(o.office_code),
      office_name: str(o.office_name),
      method: str(o.method),
      courier: strOrNull(o.courier),
      courier_tracking: strOrNull(o.courier_tracking),
      sent_on: str(o.sent_on),
      sent_at: str(o.sent_at),
      sent_by: strOrNull(o.sent_by),
      received_by: strOrNull(o.received_by),
      received_on: strOrNull(o.received_on),
    });
  }
  return rows;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-26" becomes "26 Nov". */
export function dayMonth(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return day;
  return `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}`;
}

/** Manila clock time (UTC+8) as "9:30 AM", the way the rest of the app shows times. */
export function manilaClock(iso: string): string {
  const hhmm = manilaTime(iso);
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Manila clock time (UTC+8) as HH:MM. */
export function manilaTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Maria Santos, Nov 26", or a dash when nobody has received it yet. */
export function receivedText(row: Pick<LogbookRow, "received_by" | "received_on">): string {
  if (!row.received_by) return "—";
  return row.received_on ? `${row.received_by}, ${dayMonth(row.received_on)}` : row.received_by;
}

export function logbookCsvRows(rows: LogbookRow[]): { header: string[]; lines: string[][] } {
  return {
    header: [
      "Time", "Record no.", "Subject", "To whom", "How sent", "Courier", "Courier tracking no.", "Sent by", "Received by", "Date received",
    ],
    lines: rows.map((r) => [
      manilaTime(r.sent_at),
      r.tracking_no,
      r.subject,
      r.recipient,
      isSendMethod(r.method) ? METHOD_LABEL[r.method] : r.method,
      r.courier ?? "",
      r.courier_tracking ?? "",
      r.sent_by ?? "",
      r.received_by ?? "",
      r.received_on ?? "",
    ]),
  };
}
