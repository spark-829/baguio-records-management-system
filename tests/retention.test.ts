import { describe, expect, it } from "vitest";
import { addYears, retention } from "../src/lib/retention";

describe("retention schedule", () => {
  const today = new Date("2026-11-21T00:00:00Z");
  it("counts the keep period from the day the record was finished", () => {
    expect(addYears("2021-03-01T00:00:00.000Z", 5)).toBe("2026-03-01T00:00:00.000Z");
    expect(retention("2026-10-01T00:00:00Z", 5, today).state).toBe("keep");
  });
  it("flags records for review within 90 days of the keep-until date, and past it", () => {
    expect(retention("2022-01-10T00:00:00Z", 5, today).state).toBe("review_soon");
    expect(retention("2021-01-10T00:00:00Z", 5, today).state).toBe("review_now");
    expect(retention("2026-01-10T00:00:00Z", 0, today).state).toBe("review_now");
  });
  it("never flags permanent kinds of document (50 years or more) for disposal", () => {
    const r = retention("1970-01-10T00:00:00Z", 50, today);
    expect(r.permanent).toBe(true);
    expect(r.keepUntil).toBeNull();
    expect(r.state).toBe("keep");
  });
});
