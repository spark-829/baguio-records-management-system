/** Storage boxes: code rules, form checks and history text. Mirrors the rms_boxes checks and rms_set_record_box in the database. */

export const BOX_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "cgso 2026 012" becomes "CGSO-2026-012". */
export const normalizeBoxCode = (v: unknown): string => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "-");

export const isBoxCode = (s: string): boolean => BOX_CODE_RE.test(s);

/** "CGSO-2026": the start of every code for one office and year. */
export const boxPrefix = (officeCode: string, year: number): string =>
  `${officeCode.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${year}`;

/** The next free code for a prefix: highest number used plus one, three digits at least. */
export function nextBoxCode(prefix: string, codes: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const c of codes) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export type BoxInput = {
  code: string;
  office_id: string;
  room: string;
  shelf: string;
  contents: string;
  year_from: string;
  year_to: string;
  notes: string;
};

export type BoxValue = {
  code: string;
  office_id: string;
  room: string;
  shelf: string | null;
  contents: string | null;
  year_from: number | null;
  year_to: number | null;
  notes: string | null;
};

export type BoxErrors = Partial<Record<"code" | "office" | "room" | "years", string>>;

const YEAR_ERROR = "Enter the year as 4 digits, e.g. 2019";

function parseYear(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1900 && n <= 2100 ? n : undefined;
}

export function parseBoxForm(i: BoxInput): { ok: true; value: BoxValue } | { ok: false; errors: BoxErrors } {
  const errors: BoxErrors = {};
  const code = normalizeBoxCode(i.code);
  if (!code) errors.code = "Enter a box code";
  else if (!isBoxCode(code)) errors.code = "Use only letters, numbers and dashes in the box code, e.g. CGSO-2026-012";
  const office = String(i.office_id ?? "").trim();
  if (!UUID_RE.test(office)) errors.office = "Choose the office";
  const room = String(i.room ?? "").trim().slice(0, 100);
  if (!room) errors.room = "Enter the room";
  const from = parseYear(String(i.year_from ?? ""));
  const to = parseYear(String(i.year_to ?? ""));
  if (from === undefined || to === undefined) errors.years = YEAR_ERROR;
  else if (from !== null && to !== null && to < from) errors.years = "The 'To' year must be the same as or after the 'From' year.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const opt = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max) || null;
  return {
    ok: true,
    value: {
      code,
      office_id: office,
      room,
      shelf: opt(i.shelf, 100),
      contents: opt(i.contents, 1000),
      year_from: from as number | null,
      year_to: to as number | null,
      notes: opt(i.notes, 1000),
    },
  };
}

/** "Records room B, Shelf 4" (shelf is optional). */
export const boxWhere = (room: string | null | undefined, shelf: string | null | undefined): string =>
  [room, shelf].filter(Boolean).join(", ");

/** Years covered, for use with `t`: both years, one year, or nothing. */
export function yearsText(
  from: number | null | undefined,
  to: number | null | undefined,
): { key: string; vars?: Record<string, string | number> } | null {
  if (from && to) return { key: "{a} to {b}", vars: { a: from, b: to } };
  const one = from || to;
  return one ? { key: String(one) } : null;
}

/** The history line saved when a record is put in, moved or taken out of a box (same words as the database). */
export function boxMoveText(oldCode: string | null, newCode: string | null): string {
  if (!oldCode) return `Put in box ${newCode}`;
  if (!newCode) return `Taken out of box ${oldCode}`;
  return `Moved from box ${oldCode} to ${newCode}`;
}

const BOX_ERRORS: [RegExp, string][] = [
  [/no box with that code/i, "No box has that code. Check the label, or add the box first."],
  [/only the records desk puts/i, "Only the records desk can put records in boxes."],
  [/record not found/i, "Record not found"],
];

export function boxErrorText(msg: string): string {
  for (const [re, text] of BOX_ERRORS) if (re.test(msg)) return text;
  return msg;
}
