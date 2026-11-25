import { describe, expect, it } from "vitest";
import { filterUsers, hasUserFilters, parseUserFilters, userStatus, usersHref } from "../src/lib/user-list";

const now = new Date("2026-11-25T10:00:00Z");
const OFFICE = "11111111-1111-4111-8111-111111111111";
const rows = [
  { id: "1", full_name: "Ana Dizon (Engineering Head)", role: "dept_head", office_id: OFFICE, is_active: true, locked_until: null },
  { id: "2", full_name: "Carlo Bautista", role: "staff", office_id: OFFICE, is_active: false, locked_until: null },
  { id: "3", full_name: "Liza Mendoza", role: "staff", office_id: "x", is_active: true, locked_until: "2026-11-25T10:10:00Z" },
];

describe("user list", () => {
  it("parses filters and ignores junk", () => {
    expect(parseUserFilters({ q: "  ana ", office: OFFICE, role: "staff", status: "inactive" })).toEqual({ q: "ana", office: OFFICE, role: "staff", status: "inactive" });
    expect(parseUserFilters({ office: "drop table", role: "owner", status: "gone" })).toEqual({ q: "", office: "", role: "", status: "" });
    expect(parseUserFilters({ locked: "1" }).status).toBe("locked");
  });
  it("works out the status", () => {
    expect(rows.map((r) => userStatus(r, now))).toEqual(["active", "inactive", "locked"]);
    expect(userStatus({ is_active: true, locked_until: "2026-11-25T09:00:00Z" }, now)).toBe("active");
  });
  it("filters by name words, office, role and status", () => {
    const f = parseUserFilters({});
    expect(filterUsers(rows, { ...f, q: "dizon ana" }, now).map((r) => r.id)).toEqual(["1"]);
    expect(filterUsers(rows, { ...f, office: OFFICE, role: "staff" }, now).map((r) => r.id)).toEqual(["2"]);
    expect(filterUsers(rows, { ...f, status: "locked" }, now).map((r) => r.id)).toEqual(["3"]);
    expect(hasUserFilters(f)).toBe(false);
  });
  it("builds links that keep the filters", () => {
    expect(usersHref({ q: "", office: "", role: "", status: "" })).toBe("/admin/users");
    expect(usersHref({ q: "ana d", office: "", role: "staff", status: "" }, { edit: "1" })).toBe("/admin/users?q=ana+d&role=staff&edit=1");
  });
});
