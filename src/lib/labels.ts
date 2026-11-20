import type { Confidentiality, Priority, Role, Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  registered: "Registered",
  forwarded: "Forwarded",
  received: "Received",
  under_action: "Under action",
  completed: "Completed",
  released: "Released",
  archived: "Archived",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  records_officer: "Records Officer",
  dept_head: "Department Head",
  staff: "Department Staff",
  viewer: "Viewer (read-only)",
};

const NAME_PARTICLES = new Set(["de", "del", "dela", "della", "delos", "de los", "san", "sta", "sto", "y", "jr", "jr.", "sr", "sr.", "ii", "iii"]);

/** Masks a person's name for lists (Data Privacy Act): "Juan dela Cruz" -> "J*** dela C***". Full name shows only on the record page. */
export function maskName(name: string | null | undefined) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (NAME_PARTICLES.has(w.toLowerCase()) || w.length <= 1 ? w : `${w[0]}***`))
    .join(" ");
}

/** "Name, Organization" for lists, with the person's name masked. */
export function partyLabel(name: string | null | undefined, org: string | null | undefined) {
  return [maskName(name), org ?? ""].filter(Boolean).join(", ") || "—";
}

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };

export const CONF_LABEL: Record<Confidentiality, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
};

export const STATUS_TONE: Record<Status, string> = {
  registered: "bg-slate-100 text-slate-800",
  forwarded: "bg-amber-100 text-amber-900",
  received: "bg-sky-100 text-sky-900",
  under_action: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-100 text-emerald-900",
  released: "bg-teal-100 text-teal-900",
  archived: "bg-zinc-200 text-zinc-700",
};

const MANILA = "Asia/Manila";

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: MANILA }).format(new Date(value));
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: MANILA }).format(
    new Date(value),
  );
}
