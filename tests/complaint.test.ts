import { describe, expect, it } from "vitest";
import { complaintDueDate, isComplaint, replyClock } from "../src/lib/complaint";

const created = "2026-11-24T00:00:00.000Z";
describe("complaint clock", () => {
  it("counts hours left, rounded up", () => {
    expect(replyClock({ createdAt: created, now: new Date("2026-11-24T00:30:00Z"), replied: false })).toEqual({ kind: "left", hours: 72 });
    expect(replyClock({ createdAt: created, now: new Date("2026-11-26T23:30:00Z"), replied: false })).toEqual({ kind: "left", hours: 1 });
  });
  it("counts hours late, rounded down, minimum 1", () => {
    expect(replyClock({ createdAt: created, now: new Date("2026-11-27T00:10:00Z"), replied: false })).toEqual({ kind: "late", hours: 1 });
    expect(replyClock({ createdAt: created, now: new Date("2026-11-27T05:00:00Z"), replied: false })).toEqual({ kind: "late", hours: 5 });
  });
  it("stops when replied", () => {
    expect(replyClock({ createdAt: created, now: new Date("2027-01-01"), replied: true })).toEqual({ kind: "replied" });
  });
  it("due date crosses Manila midnight", () => {
    // 17:00 UTC = 01:00 next day in Manila; plus 72 h
    expect(complaintDueDate("2026-11-24T17:00:00Z")).toBe("2026-11-28");
    expect(complaintDueDate("2026-11-24T10:00:00Z")).toBe("2026-11-27");
  });
  it("matches the type name exactly", () => {
    expect(isComplaint("Complaint")).toBe(true);
    expect(isComplaint("Request / Complaint")).toBe(false);
  });
});
