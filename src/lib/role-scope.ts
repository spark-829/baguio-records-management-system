// Pure role checks shared by the layout, pages and tests (no server imports).
import type { Role } from "./types";

type Who = { role: Role; is_auditor?: boolean | null; office_id?: string | null };

/** Administrators, and Viewer accounts flagged as auditors, may read the audit trail and access history (QA-097). Mirror of rms_is_auditor(). */
export function canAudit(p: Who): boolean {
  return p.role === "admin" || (p.role === "viewer" && p.is_auditor === true);
}

/** An auditor with no office (for example a COA resident auditor): their work is the audit trail only, so they get the audit pages and nothing else. */
export function isAuditOnly(p: Who): boolean {
  return p.role === "viewer" && p.is_auditor === true && !p.office_id;
}

/** The auditor flag only sticks on Viewer accounts (the database refuses it on any other role). */
export function auditorFlag(role: string, checked: boolean): boolean {
  return role === "viewer" && checked;
}

/** Office field from the admin form: an empty choice means no office (auditors and administrators). */
export function officeFromForm(value: FormDataEntryValue | null): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}
