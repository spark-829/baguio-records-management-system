import { STATUS_LABEL } from "./labels";
import type { Status } from "./types";

export type RouteLookups = { tracking: Map<string, string>; offices: Map<string, string> };

/** Friendly integrity-check failure text; never exposes the raw database error. */
export function integrityErrorText(err: { code?: string | null; message?: string | null }): string {
  const timedOut = err.code === "57014" || /statement timeout/i.test(err.message ?? "");
  return timedOut
    ? "The integrity check is taking longer than usual. The entries below are still shown; try again in a minute."
    : "Could not run the integrity check right now. Try again in a minute.";
}

export type CheckInfo = { verified_to_id: number; pending: number; last_full_pass_at: string | null };

/** Which coverage sentence to show under the integrity result (key goes through t(), vars fill the {placeholders}). */
export function checkCoverageText(info: CheckInfo, fmt: (iso: string) => string): { key: string; vars: Record<string, string> } {
  if (info.pending > 0) {
    return {
      key: "Checked through entry #{n}. {pending} newer entries will be checked on the next visits.",
      vars: { n: String(info.verified_to_id), pending: String(info.pending) },
    };
  }
  if (info.last_full_pass_at) {
    return {
      key: "Every link is intact and new entries are sealed correctly. Older entries are re-checked in rotation; the last full re-check finished {when}.",
      vars: { when: fmt(info.last_full_pass_at) },
    };
  }
  return {
    key: "Every link is intact and new entries are sealed correctly. Older entries are re-checked in rotation; the first full re-check is still running.",
    vars: {},
  };
}

/** Plain-language line for a routing row in the audit log. */
export function routeText(d: Record<string, unknown>, lk: RouteLookups): string {
  const status = STATUS_LABEL[d.status as Status] ?? String(d.status ?? "");
  const tn = lk.tracking.get(String(d.record_id ?? ""));
  const from = lk.offices.get(String(d.from_office_id ?? ""));
  const to = lk.offices.get(String(d.to_office_id ?? ""));
  const where = from && to && from !== to ? ` (${from} → ${to})` : to ? ` at ${to}` : "";
  const what = `${d.action_taken ?? ""}${d.remarks ? ` (“${d.remarks}”)` : ""}`;
  return `${tn ? `${tn} · ` : ""}${status}${where}: ${what}`;
}

const SIGN_IN_KEYS = new Set(["last_login_at", "failed_attempts", "locked_until", "updated_at"]);
const ROLE_WORD: Record<string, string> = {
  admin: "Administrator",
  records_officer: "Records Officer",
  dept_head: "Department Head",
  staff: "Department Staff",
  viewer: "Viewer (read-only)",
};

/** Audit "Details" for a user account row: says what changed instead of repeating the name and role. */
export function profileText(action: string, data: Record<string, unknown> | null, old: Record<string, unknown> | null, offices: Map<string, string>): string {
  const d = data ?? old ?? {};
  const role = (r: unknown) => ROLE_WORD[String(r)] ?? String(r ?? "");
  if (action !== "UPDATE" || !data || !old) return `${d.full_name ?? ""} · ${role(d.role)}${d.is_active === false ? " · deactivated" : ""}`;
  const changed = Object.keys(data).filter((k) => JSON.stringify(data[k]) !== JSON.stringify(old[k]));
  if (changed.every((k) => SIGN_IN_KEYS.has(k))) {
    const lockedNow = data.locked_until && data.locked_until !== old.locked_until;
    if (lockedNow) return "Locked after too many wrong passwords";
    if (old.locked_until && !data.locked_until && !changed.includes("last_login_at")) return "Unlocked";
    if (changed.includes("last_login_at")) return "Signed in (last sign-in time saved)";
    if (changed.includes("failed_attempts")) return Number(data.failed_attempts) > 0 ? `Wrong password (${data.failed_attempts} in a row)` : "Wrong-password count reset";
    return "No visible change";
  }
  const parts: string[] = [];
  if (changed.includes("full_name")) parts.push(`name changed to “${data.full_name}”`);
  if (changed.includes("role")) parts.push(`role ${role(old.role)} → ${role(data.role)}`);
  if (changed.includes("office_id")) parts.push(`office → ${offices.get(String(data.office_id)) ?? "another office"}`);
  if (changed.includes("is_active")) parts.push(data.is_active ? "can sign in again" : "deactivated");
  if (changed.includes("window_intake")) parts.push(data.window_intake ? "window receiving on" : "window receiving off");
  if (changed.includes("locked_until") && old.locked_until && !data.locked_until) parts.push("unlocked");
  const text = parts.join(", ");
  return `${old.full_name ?? d.full_name ?? ""}: ${text || "account updated"}`;
}
