import { describe, expect, it } from "vitest";
import { addWorkingDays, artaDue, artaProgress, artaText, easterSunday, isWorkingDay, workingDaysBetween } from "../src/lib/arta";

describe("arta", () => {
  it("finds Easter", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
  it("knows working days", () => {
    for (const d of ["2026-04-02", "2026-04-03", "2026-08-31", "2026-09-01", "2026-11-28", "2026-11-30"]) expect(isWorkingDay(d)).toBe(false);
    expect(isWorkingDay("2026-11-24")).toBe(true);
  });
  it("adds working days", () => {
    expect(addWorkingDays("2026-11-23", 3)).toBe("2026-11-26");
    expect(addWorkingDays("2026-11-23", 7)).toBe("2026-12-03");
    expect(addWorkingDays("2026-11-23", 20)).toBe("2026-12-23");
    expect(addWorkingDays("2026-03-31", 3)).toBe("2026-04-07");
    expect(addWorkingDays("2026-08-28", 3)).toBe("2026-09-04");
    expect(addWorkingDays("2026-11-27", 3)).toBe("2026-12-03");
  });
  it("counts working days between", () => {
    expect(workingDaysBetween("2026-11-23", "2026-11-26")).toBe(3);
    expect(workingDaysBetween("2026-11-26", "2026-12-01")).toBe(2);
    expect(workingDaysBetween("2026-11-23", "2026-11-23")).toBe(0);
    expect(workingDaysBetween("2026-11-26", "2026-11-23")).toBe(0);
  });
  it("has no due date for none", () => {
    expect(artaDue("none", "2026-11-23")).toBeNull();
    expect(artaDue("simple", "2026-11-23")).toBe("2026-11-26");
  });
  it("describes progress", () => {
    const base = { registered: "2026-11-23", due: "2026-11-26" };
    const text = (asOf: string, finished = false) => artaText(artaProgress({ ...base, asOf, finished }));
    expect(text("2026-11-23")).toBe("Registered today. 3 working days to act.");
    expect(text("2026-11-25")).toBe("Working day 2 of 3");
    expect(text("2026-12-01")).toBe("2 working days late");
    expect(text("2026-11-26", true)).toBe("Finished on working day 3 of 3");
    expect(text("2026-11-27")).toBe("1 working day late");
    expect(text("2026-12-01", true)).toBe("Finished 2 working days late");
  });
});
