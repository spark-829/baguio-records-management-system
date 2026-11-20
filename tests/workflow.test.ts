import { describe, expect, it } from "vitest";
import { allowedActions, isOverdue, nextStatus } from "../src/lib/workflow";

const base = { direction: "incoming" as const, userOfficeId: "ceo", currentOfficeId: "ceo" };

describe("allowedActions", () => {
  it("lets the records desk act on any record", () => {
    expect(allowedActions({ ...base, status: "forwarded", role: "records_officer", userOfficeId: "cmo" })).toContain("receive");
  });

  it("blocks staff of an office that does not hold the record", () => {
    expect(allowedActions({ ...base, status: "under_action", role: "staff", userOfficeId: "cto" })).toEqual([]);
  });

  it("lets the holding office receive a forwarded record", () => {
    expect(allowedActions({ ...base, status: "forwarded", role: "staff" })).toEqual(["receive", "remark"]);
  });

  it("does not offer release for an incoming record that was just registered", () => {
    expect(allowedActions({ ...base, status: "registered", role: "records_officer" })).not.toContain("release");
  });

  it("keeps archiving to the records desk", () => {
    expect(allowedActions({ ...base, status: "completed", role: "dept_head" })).not.toContain("archive");
    expect(allowedActions({ ...base, status: "completed", role: "admin" })).toContain("archive");
  });

  it("makes archived records read-only for everyone", () => {
    expect(allowedActions({ ...base, status: "archived", role: "admin" })).toEqual([]);
  });
});

describe("nextStatus", () => {
  it("moves the record for status actions", () => {
    expect(nextStatus("received", "act")).toBe("under_action");
    expect(nextStatus("under_action", "forward")).toBe("forwarded");
  });
  it("keeps the status for a remark", () => {
    expect(nextStatus("under_action", "remark")).toBe("under_action");
  });
});

describe("isOverdue", () => {
  const today = new Date("2026-11-20T03:00:00Z"); // 11:00 in Manila
  it("flags open records past their due date", () => {
    expect(isOverdue("2026-11-19", "under_action", today)).toBe(true);
  });
  it("does not flag records due today", () => {
    expect(isOverdue("2026-11-20", "under_action", today)).toBe(false);
  });
  it("never flags finished records", () => {
    expect(isOverdue("2026-01-01", "completed", today)).toBe(false);
    expect(isOverdue("2026-01-01", "archived", today)).toBe(false);
  });
  it("uses Manila time, not UTC", () => {
    const lateNightUtc = new Date("2026-11-19T17:00:00Z"); // 01:00 Nov 20 in Manila
    expect(isOverdue("2026-11-19", "received", lateNightUtc)).toBe(true);
  });
});
