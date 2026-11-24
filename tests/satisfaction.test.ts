import { describe, expect, it } from "vitest";
import { hrmoDeadline, monthParam, parseSurveyForm, pct, satisfactionCsv } from "../src/lib/satisfaction";

describe("parseSurveyForm", () => {
  it("needs the first answer", () => {
    expect(parseSurveyForm({})).toEqual({ ok: false, missing: "q_satisfied" });
    expect(parseSurveyForm({ q_satisfied: "" })).toEqual({ ok: false, missing: "q_satisfied" });
  });
  it("keeps N/A as 0 and unanswered as null", () => {
    const r = parseSurveyForm({ q_satisfied: "5", q_time: "0", saw_charter: "yes", comment: "  hi  " });
    expect(r).toEqual({ ok: true, value: { q_satisfied: 5, q_time: 0, q_steps: null, q_fair: null, q_staff: null, saw_charter: true, comment: "hi" } });
  });
  it("rejects out of range and junk", () => {
    expect(parseSurveyForm({ q_satisfied: "6" }).ok).toBe(false);
    expect(parseSurveyForm({ q_satisfied: "3", q_fair: "-1" }).ok).toBe(false);
    expect(parseSurveyForm({ q_satisfied: "abc" }).ok).toBe(false);
  });
  it("caps the comment at 1000 characters", () => {
    const r = parseSurveyForm({ q_satisfied: "4", comment: "x".repeat(1500) });
    expect(r.ok && r.value.comment?.length).toBe(1000);
  });
});

describe("helpers", () => {
  it("pct is null with no answers", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33);
  });
  it("monthParam defaults to the current month", () => {
    expect(monthParam(undefined, "2026-11-24")).toBe("2026-11");
    expect(monthParam("", "2026-01-05")).toBe("2026-01");
    expect(monthParam("2026-13", "2026-11-24")).toBe("2026-11");
    expect(monthParam("2026-03", "2026-11-24")).toBe("2026-03");
  });
  it("hrmoDeadline is the 7th of the next month", () => {
    expect(hrmoDeadline("2026-11")).toBe("2026-12-07");
    expect(hrmoDeadline("2026-12")).toBe("2027-01-07");
  });
  it("builds the CSV", () => {
    const csv = satisfactionCsv({ comments: [], offices: [{ office_id: "1", office: "CGSO", responses: 2, sat_yes: 1, sat_n: 2, time_yes: 0, time_n: 0, steps_yes: 0, steps_n: 0, fair_yes: 0, fair_n: 0, staff_yes: 0, staff_n: 0, charter_yes: 1, charter_n: 1 }] }, "2026-10");
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain('"Satisfied %"');
    expect(lines[1]).toBe('"2026-10","CGSO","2","50","","","","","100"');
  });
});
