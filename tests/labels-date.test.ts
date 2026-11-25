import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, greetingName } from "../src/lib/labels";

describe("date formatting", () => {
  it("uses Manila time", () => {
    expect(fmtDate("2026-11-23T20:00:00Z")).toContain("Nov 24, 2026");
  });
  it("gives the same result on repeat calls", () => {
    expect(fmtDate("2026-11-23T20:00:00Z")).toBe(fmtDate("2026-11-23T20:00:00Z"));
  });
  it("works for other locales", () => {
    expect(fmtDate("2026-11-23T20:00:00Z", "fil-PH")).toMatch(/2026/);
    expect(fmtDate("2026-11-23T20:00:00Z", "en-PH")).toMatch(/2026/);
  });
  it("shows a dash for empty values", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDateTime(undefined)).toBe("—");
  });
  it("includes the time", () => {
    expect(fmtDateTime("2026-11-23T20:00:00Z")).toMatch(/\d:\d\d/);
  });
  it("uses plain spaces only, so server and browser text match", () => {
    expect(fmtDateTime("2026-11-23T20:00:00Z")).not.toMatch(/[\u202F\u00A0]/);
  });
  it("does not depend on the machine time zone", () => {
    // 16:30 UTC is already the next day in Manila (UTC+8)
    expect(fmtDateTime("2026-11-23T16:30:00Z")).toContain("Nov 24, 2026");
  });
});

describe("greetingName", () => {
  it("uses the first name of a person and the whole title of a role account", () => {
    expect(greetingName("Ana Dizon (Engineering Head)")).toBe("Ana");
    expect(greetingName("Atty. Teresa Navarro (City Legal Officer)")).toBe("Teresa");
    expect(greetingName("Civil Registry Window Clerk")).toBe("Civil Registry Window Clerk");
    expect(greetingName("Mayor's Office Head")).toBe("Mayor's Office Head");
  });
});
