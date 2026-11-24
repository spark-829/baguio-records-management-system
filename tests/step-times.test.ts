import { describe, expect, it } from "vitest";
import { CHARTER_MINUTES, fmtMinutes, officeMinutesBetween, parseStepMinutes, slowSteps, stepKind, validateStepForm } from "../src/lib/step-times";

describe("parseStepMinutes", () => {
  it("falls back to the charter times for garbage", () => {
    expect(parseStepMinutes(null)).toEqual(CHARTER_MINUTES);
    expect(parseStepMinutes("x")).toEqual(CHARTER_MINUTES);
    expect(parseStepMinutes([1])).toEqual(CHARTER_MINUTES);
  });
  it("keeps only valid keys and values", () => {
    expect(parseStepMinutes({ register: 12, forward: 0, receive: 1.5, bogus: 3, act: 601 })).toEqual({ register: 12 });
  });
});

describe("validateStepForm", () => {
  it("rejects 0, 601 and 1.5", () => {
    for (const v of ["0", "601", "1.5", "abc"]) expect(validateStepForm({ register: v })).toEqual({ error: "Type minutes from 1 to 600." });
  });
  it("blank removes the key", () => {
    expect(validateStepForm({ register: "9", forward: "", act: " 5 " })).toEqual({ ok: true, minutes: { register: 9, act: 5 } });
  });
});

describe("stepKind", () => {
  const base = { created_at: "2026-11-23T01:00:00Z" };
  it("classifies steps", () => {
    expect(stepKind({ ...base, status: "under_action", assigned_to: "u1" })).toBe("assign");
    expect(stepKind({ ...base, status: "forwarded", from_office_id: "a", to_office_id: "b" })).toBe("forward");
    expect(stepKind({ ...base, status: "forwarded", from_office_id: "a", to_office_id: "a" })).toBeNull();
    expect(stepKind({ ...base, status: "received" }, { ...base, status: "forwarded" })).toBe("receive");
    expect(stepKind({ ...base, status: "under_action" }, { ...base, status: "received" })).toBe("act");
    expect(stepKind({ ...base, status: "under_action" }, { ...base, status: "under_action" })).toBeNull();
  });
});

describe("officeMinutesBetween", () => {
  it("counts a same-day span", () => {
    expect(officeMinutesBetween("2026-11-23T01:00:00Z", "2026-11-23T01:30:00Z")).toBe(30); // 09:00 to 09:30 Manila
  });
  it("skips the weekend", () => {
    expect(officeMinutesBetween("2026-11-20T08:55:00Z", "2026-11-23T00:10:00Z")).toBe(15); // Fri 16:55 to Mon 08:10
  });
  it("skips a holiday (Nov 30)", () => {
    expect(officeMinutesBetween("2026-11-27T08:55:00Z", "2026-12-01T00:10:00Z")).toBe(15);
  });
  it("gives 0 for equal or reversed times", () => {
    expect(officeMinutesBetween("2026-11-23T01:00:00Z", "2026-11-23T01:00:00Z")).toBe(0);
    expect(officeMinutesBetween("2026-11-23T02:00:00Z", "2026-11-23T01:00:00Z")).toBe(0);
  });
});

describe("slowSteps", () => {
  it("flags only over-standard steps and never the first", () => {
    const steps = [
      { id: "r1", status: "registered", created_at: "2026-11-23T01:00:00Z" },
      { id: "r2", status: "forwarded", from_office_id: "a", to_office_id: "b", created_at: "2026-11-23T01:03:00Z" },
      { id: "r3", status: "received", created_at: "2026-11-23T03:30:00Z" },
    ];
    expect(slowSteps(steps, CHARTER_MINUTES)).toEqual({ r3: { took: 147, standard: 5 } });
  });
});

describe("fmtMinutes", () => {
  it("formats", () => {
    expect(fmtMinutes(135)).toEqual({ key: "{h} h {m} min", vars: { h: 2, m: 15 } });
    expect(fmtMinutes(7)).toEqual({ key: "{m} min", vars: { m: 7 } });
  });
});
