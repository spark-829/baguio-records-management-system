import { describe, expect, it } from "vitest";
import { assignableStaff, assignmentEvents, canAssign } from "../src/lib/assign";

const base = { userOfficeId: "ceo", currentOfficeId: "ceo", status: "received" as const, deleted: false };

describe("canAssign", () => {
  it("refuses admin, viewer and staff", () => {
    for (const role of ["admin", "viewer", "staff"] as const) expect(canAssign({ ...base, role })).toBe(false);
  });
  it("refuses a head of another office", () => {
    expect(canAssign({ ...base, role: "dept_head", userOfficeId: "cto" })).toBe(false);
  });
  it("refuses forwarded, completed and deleted records", () => {
    expect(canAssign({ ...base, role: "dept_head", status: "forwarded" })).toBe(false);
    expect(canAssign({ ...base, role: "dept_head", status: "completed" })).toBe(false);
    expect(canAssign({ ...base, role: "dept_head", deleted: true })).toBe(false);
  });
  it("allows the head of the holding office and the records desk", () => {
    expect(canAssign({ ...base, role: "dept_head" })).toBe(true);
    expect(canAssign({ ...base, role: "records_officer", userOfficeId: "cgso" })).toBe(true);
    expect(canAssign({ ...base, role: "dept_head", status: "registered" })).toBe(true);
  });
});

describe("assignableStaff", () => {
  const people = [
    { id: "1", full_name: "Zed", role: "staff" },
    { id: "2", full_name: "Amy", role: "dept_head" },
    { id: "3", full_name: "Ben", role: "staff" },
  ];
  it("sorts by name", () => {
    expect(assignableStaff(people, "internal").map((p) => p.id)).toEqual(["2", "3", "1"]);
  });
  it("returns heads only for a confidential record", () => {
    expect(assignableStaff(people, "confidential").map((p) => p.id)).toEqual(["2"]);
  });
});

describe("assignmentEvents", () => {
  it("clears only on the forward after an assignment", () => {
    const ev = assignmentEvents([
      { id: "r1", assigned_to: null, from_office_id: "a", to_office_id: "a" },
      { id: "r2", assigned_to: "p1", from_office_id: "a", to_office_id: "a" },
      { id: "r3", assigned_to: "p2", from_office_id: "a", to_office_id: "a" },
      { id: "r4", assigned_to: null, from_office_id: "a", to_office_id: "b" },
      { id: "r5", assigned_to: null, from_office_id: "b", to_office_id: "c" },
    ]);
    expect(ev).toEqual({
      r2: { kind: "assigned", assigneeId: "p1" },
      r3: { kind: "assigned", assigneeId: "p2" },
      r4: { kind: "cleared" },
    });
  });
});
