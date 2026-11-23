import { describe, expect, it } from "vitest";
import { badgeText, parseAlerts } from "../src/lib/alerts";

describe("alerts", () => {
  it("formats the badge", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(5)).toBe("5");
    expect(badgeText(100)).toBe("99+");
  });
  it("parses defensively", () => {
    expect(parseAlerts(null)).toEqual({ count: 0, to_receive: 0, late: 0, rows: [] });
    const a = parseAlerts({ count: "3", to_receive: "2", late: "1", rows: [{ id: "x", tracking_no: "IN-2026-0001", subject: "S", status: "forwarded", due_date: null, to_receive: true, late: "yes" }] });
    expect(a.count).toBe(3);
    expect(a.late).toBe(1);
    expect(a.rows[0]).toMatchObject({ to_receive: true, late: false, due_date: null });
  });
});
