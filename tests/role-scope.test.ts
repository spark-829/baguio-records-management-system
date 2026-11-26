import { describe, expect, it } from "vitest";
import { auditorFlag, canAudit, isAuditOnly, officeFromForm } from "../src/lib/role-scope";

const OFFICE = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

describe("canAudit", () => {
  it("lets administrators and flagged viewers read the audit trail", () => {
    expect(canAudit({ role: "admin" })).toBe(true);
    expect(canAudit({ role: "viewer", is_auditor: true })).toBe(true);
  });
  it("keeps plain viewers and every other role out", () => {
    expect(canAudit({ role: "viewer" })).toBe(false);
    expect(canAudit({ role: "viewer", is_auditor: false, office_id: OFFICE })).toBe(false);
    for (const role of ["records_officer", "dept_head", "staff"] as const) expect(canAudit({ role, is_auditor: true })).toBe(false);
  });
});

describe("isAuditOnly", () => {
  it("is true only for a flagged viewer without an office", () => {
    expect(isAuditOnly({ role: "viewer", is_auditor: true, office_id: null })).toBe(true);
    expect(isAuditOnly({ role: "viewer", is_auditor: true, office_id: OFFICE })).toBe(false);
    expect(isAuditOnly({ role: "viewer", is_auditor: false, office_id: null })).toBe(false);
    expect(isAuditOnly({ role: "admin", is_auditor: true, office_id: null })).toBe(false);
  });
});

describe("auditorFlag", () => {
  it("drops the flag when the role is not Viewer", () => {
    expect(auditorFlag("viewer", true)).toBe(true);
    expect(auditorFlag("viewer", false)).toBe(false);
    expect(auditorFlag("staff", true)).toBe(false);
  });
});

describe("officeFromForm", () => {
  it("turns an empty or odd value into no office", () => {
    expect(officeFromForm(OFFICE)).toBe(OFFICE);
    expect(officeFromForm("")).toBeNull();
    expect(officeFromForm(null)).toBeNull();
    expect(officeFromForm("x; drop")).toBeNull();
  });
});
