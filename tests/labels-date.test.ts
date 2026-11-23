import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "../src/lib/labels";

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
});
