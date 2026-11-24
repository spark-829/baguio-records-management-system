import type { Confidentiality, Role, Status } from "./types";

/** Statuses where the office is working on the record, so a person can be assigned. Same rule as rms_routes_guard_insert. */
export const ASSIGNABLE: Status[] = ["registered", "received", "under_action"];

/** Who may assign: the head of the office holding the record, or the records desk. Admins never assign. */
export function canAssign(a: {
  role: Role;
  userOfficeId: string | null;
  currentOfficeId: string;
  status: Status;
  deleted: boolean;
}): boolean {
  if (a.deleted || !ASSIGNABLE.includes(a.status)) return false;
  if (a.role === "records_officer") return true;
  return a.role === "dept_head" && a.userOfficeId === a.currentOfficeId;
}

/** People who can be picked: confidential records go to the office head only. Sorted by name. */
export function assignableStaff<T extends { full_name: string; role: string }>(profiles: T[], confidentiality: Confidentiality): T[] {
  return profiles
    .filter((p) => confidentiality !== "confidential" || p.role === "dept_head")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export type AssignmentEvent = { kind: "assigned"; assigneeId: string } | { kind: "cleared" };

/**
 * Walks the history oldest first. A route with a person is "assigned". The first route that moves the record to
 * another office while someone is assigned is "cleared" (rms_routes_apply clears the person on a forward).
 */
export function assignmentEvents(
  oldestFirst: { id: string; assigned_to: string | null; from_office_id: string | null; to_office_id: string | null }[],
): Record<string, AssignmentEvent> {
  const out: Record<string, AssignmentEvent> = {};
  let current: string | null = null;
  for (const r of oldestFirst) {
    if (r.assigned_to) {
      out[r.id] = { kind: "assigned", assigneeId: r.assigned_to };
      current = r.assigned_to;
    } else if (current && r.to_office_id !== r.from_office_id) {
      out[r.id] = { kind: "cleared" };
      current = null;
    }
  }
  return out;
}
