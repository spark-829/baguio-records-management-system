import { describe, expect, it } from "vitest";
import { actionButtons, allowedActions, canAttach, isAlreadyReceived, isOverdue, nextStatus, primaryAction } from "../src/lib/workflow";

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
    expect(allowedActions({ ...base, status: "completed", role: "records_officer" })).toContain("archive");
  });

  it("gives admins no record actions, holding office or not", () => {
    for (const status of ["registered", "forwarded", "received", "under_action", "completed"] as const) {
      expect(allowedActions({ ...base, status, role: "admin" })).toEqual([]);
      expect(allowedActions({ ...base, status, role: "admin", userOfficeId: "cmo" })).toEqual([]);
    }
  });

  it("makes archived records read-only for everyone", () => {
    expect(allowedActions({ ...base, status: "archived", role: "records_officer" })).toEqual([]);
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

import { maskName, partyLabel } from "../src/lib/labels";

describe("privacy masking", () => {
  it("masks each part of a person's name but keeps particles", () => {
    expect(maskName("Juan dela Cruz")).toBe("J*** dela C***");
    expect(maskName("Maria Santos Jr.")).toBe("M*** S*** Jr.");
  });
  it("shows the organization unmasked", () => {
    expect(partyLabel("Juan dela Cruz", "Barangay Irisan")).toBe("J*** dela C***, Barangay Irisan");
    expect(partyLabel(null, "DPWH")).toBe("DPWH");
    expect(partyLabel(null, null)).toBe("—");
  });
});

describe("viewer role", () => {
  it("has no actions even on records in its office", () => {
    expect(allowedActions({ status: "received", direction: "incoming", role: "viewer", userOfficeId: "a", currentOfficeId: "a" })).toEqual([]);
  });
});

describe("isAlreadyReceived", () => {
  const o = { role: "staff" as const, userOfficeId: "ceo", currentOfficeId: "ceo" };
  it("is true for staff at the holding office", () => {
    expect(isAlreadyReceived({ ...o, status: "received" })).toBe(true);
    expect(isAlreadyReceived({ ...o, status: "under_action" })).toBe(true);
  });
  it("is false for another office", () => {
    expect(isAlreadyReceived({ ...o, status: "received", userOfficeId: "cto" })).toBe(false);
  });
  it("is true for the records desk", () => {
    expect(isAlreadyReceived({ ...o, status: "received", role: "records_officer", userOfficeId: "cmo" })).toBe(true);
  });
  it("is false for a viewer", () => {
    expect(isAlreadyReceived({ ...o, status: "received", role: "viewer" })).toBe(false);
  });
  it("is false for a forwarded record", () => {
    expect(isAlreadyReceived({ ...o, status: "forwarded" })).toBe(false);
  });
});

describe("canAttach", () => {
  const rec = { userOfficeId: "ceo", currentOfficeId: "ceo", originOfficeId: "cmo", status: "received" as const, deleted: false };
  it("is never true for admin", () => {
    expect(canAttach({ ...rec, role: "admin" })).toBe(false);
  });
  it("is true for the records desk", () => {
    expect(canAttach({ ...rec, role: "records_officer", userOfficeId: "cto" })).toBe(true);
  });
  it("is true for staff at the current or origin office, false elsewhere", () => {
    expect(canAttach({ ...rec, role: "staff" })).toBe(true);
    expect(canAttach({ ...rec, role: "staff", userOfficeId: "cmo", currentOfficeId: "ceo" })).toBe(true);
    expect(canAttach({ ...rec, role: "staff", userOfficeId: "cto" })).toBe(false);
    expect(canAttach({ ...rec, role: "viewer" })).toBe(false);
  });
  it("is false for archived or deleted records", () => {
    expect(canAttach({ ...rec, role: "records_officer", status: "archived" })).toBe(false);
    expect(canAttach({ ...rec, role: "records_officer", deleted: true })).toBe(false);
  });
});

describe("isAlreadyReceived for admin", () => {
  it("is false for admin", () => {
    expect(isAlreadyReceived({ status: "received", role: "admin", userOfficeId: "ceo", currentOfficeId: "ceo" })).toBe(false);
  });
});

describe("primaryAction", () => {
  const all = ["forward", "receive", "act", "remark", "complete", "release", "archive"] as const;
  const a = [...all];
  it("picks the usual next step", () => {
    expect(primaryAction("forwarded", "incoming", a)).toBe("receive");
    expect(primaryAction("registered", "incoming", a)).toBe("forward");
    expect(primaryAction("registered", "outgoing", a)).toBe("release");
    expect(primaryAction("received", "incoming", a)).toBe("act");
    expect(primaryAction("under_action", "incoming", a)).toBe("complete");
    expect(primaryAction("completed", "outgoing", a)).toBe("release");
    expect(primaryAction("completed", "incoming", a)).toBe("archive");
    expect(primaryAction("released", "outgoing", a)).toBe("archive");
  });
  it("falls back to the first allowed non-note action", () => {
    expect(primaryAction("completed", "incoming", ["forward", "remark"])).toBe("forward");
    expect(primaryAction("completed", "incoming", [])).toBeNull();
    expect(primaryAction("completed", "incoming", ["remark"])).toBeNull();
  });
});

describe("actionButtons", () => {
  it("splits primary, secondary and more", () => {
    expect(actionButtons(["act", "forward", "remark", "complete"], "act", true)).toEqual({ primary: "act", secondary: ["forward", "return"], more: ["complete"] });
    const r = actionButtons(["forward", "act", "remark", "complete", "archive"], "forward", true);
    expect(r.secondary).toEqual(["return", "act"]);
    expect(r.more).toEqual(["complete", "archive"]);
  });
  it("never lists notes", () => {
    const r = actionButtons(["remark", "act", "forward"], "act", false);
    expect([r.primary, ...r.secondary, ...r.more]).not.toContain("remark");
  });
  it("handles no primary", () => {
    const r = actionButtons(["act", "forward", "complete"], null, false);
    expect(r).toEqual({ primary: null, secondary: ["act", "forward"], more: ["complete"] });
  });
  it("ignores a primary that is not allowed", () => {
    expect(actionButtons(["act"], "archive", false)).toEqual({ primary: null, secondary: ["act"], more: [] });
  });
});
