import type { Confidentiality, Priority, Role, Status } from "./types";

const MANILA = "Asia/Manila";

export const STATUS_LABEL: Record<Status, string> = {
  registered: "Registered",
  forwarded: "Forwarded",
  received: "Received",
  under_action: "Being worked on",
  completed: "Completed",
  released: "Sent out",
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

/** Plain-language meaning of each confidentiality level, for people who don't know the terms. */
export const CONF_HELP: Record<Confidentiality, string> = {
  public: "Anyone in the City offices may see it",
  internal: "City staff involved with it may see it",
  confidential: "Only the records desk and the offices handling it",
};

/** Office name for people: "City Engineering Office" rather than the bare code "CEO". */
export function officeName(o: { code: string; name: string } | null | undefined) {
  return o ? o.name : "—";
}

/** Whole days from today (Manila) to a date: negative when the date has passed. */
export function daysFromToday(date: string, today = new Date()) {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA }).format(today);
  return Math.round((Date.parse(date) - Date.parse(t)) / 86_400_000);
}

/** "2 days late", "due today", "due in 3 days". */
export function dueText(date: string | null | undefined, today = new Date()) {
  if (!date) return "";
  const d = daysFromToday(date.slice(0, 10), today);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} late`;
  if (d === 0) return "due today";
  return `due in ${d} day${d === 1 ? "" : "s"}`;
}

export const STATUS_TONE: Record<Status, string> = {
  registered: "bg-slate-100 text-slate-800",
  forwarded: "bg-amber-100 text-amber-900",
  received: "bg-sky-100 text-sky-900",
  under_action: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-100 text-emerald-900",
  released: "bg-teal-100 text-teal-900",
  archived: "bg-zinc-200 text-zinc-700",
};

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
