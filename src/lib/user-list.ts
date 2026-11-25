// Pure helpers for the admin "User accounts" list: filters from the query
// string, the status of each account, and the filtering itself.

export type UserStatus = "active" | "inactive" | "locked";
export const USER_STATUSES: UserStatus[] = ["active", "locked", "inactive"];
const ROLES = ["admin", "records_officer", "dept_head", "staff", "viewer"] as const;

export type UserRow = {
  id: string;
  full_name: string;
  role: string;
  office_id: string | null;
  is_active: boolean;
  locked_until: string | null;
};

export type UserFilters = { q: string; office: string; role: string; status: UserStatus | "" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read the list filters from the query string. `locked=1` is the old link from the Security overview. */
export function parseUserFilters(sp: Record<string, string | undefined>): UserFilters {
  const q = (sp.q ?? "").trim().slice(0, 80);
  const office = UUID.test(sp.office ?? "") ? (sp.office as string) : "";
  const role = (ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as string) : "";
  const status = sp.locked === "1" ? "locked" : (USER_STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as UserStatus) : "";
  return { q, office, role, status };
}

export function userStatus(u: Pick<UserRow, "is_active" | "locked_until">, now: Date = new Date()): UserStatus {
  if (u.locked_until && new Date(u.locked_until) > now) return "locked";
  return u.is_active ? "active" : "inactive";
}

export function filterUsers<T extends UserRow>(rows: T[], f: UserFilters, now: Date = new Date()): T[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((u) => {
    if (f.office && u.office_id !== f.office) return false;
    if (f.role && u.role !== f.role) return false;
    if (f.status && userStatus(u, now) !== f.status) return false;
    const name = u.full_name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
}

export function hasUserFilters(f: UserFilters): boolean {
  return Boolean(f.q || f.office || f.role || f.status);
}

/** Query string for the list with these filters plus extra keys (empty values dropped). */
export function usersHref(f: UserFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: f.q, office: f.office, role: f.role, status: f.status, ...extra })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}
