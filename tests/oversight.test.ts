import { describe, expect, it } from "vitest";
import { maskedSubject, parseCityRecord, parseCityRows, parseOverview } from "../src/lib/oversight";

const t = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));

describe("oversight parsers", () => {
  it("tolerate null and junk", () => {
    expect(parseOverview(null)).toEqual({ totals: { open: 0, late: 0, due_soon: 0, waiting: 0 }, offices: [], late: [] });
    expect(parseOverview("x").offices).toEqual([]);
    expect(parseCityRows(null)).toEqual([]);
    expect(parseCityRows([1, null, "x"])).toEqual([]);
    expect(parseCityRecord(null)).toBeNull();
    expect(parseCityRecord({})).toBeNull();
  });
  it("reads an overview", () => {
    const o = parseOverview({
      totals: { open: 5, late: 2, due_soon: 1, waiting: 0 },
      offices: [{ code: "CEO", name: "Engineering", open: 3, late: 1, waiting: 0 }],
      late: [{ id: "a", tracking_no: "IN-2026-0001", office_code: "CEO", office: "Engineering", due_date: "2026-11-01", status: "received", confidential: true, subject: null }],
    });
    expect(o.totals.late).toBe(2);
    expect(o.offices[0].code).toBe("CEO");
    expect(o.late[0].confidential).toBe(true);
    expect(o.late[0].subject).toBeNull();
  });
  it("reads one record without steps", () => {
    const r = parseCityRecord({ tracking_no: "IN-2026-0001", confidential: false, history: [{ status: "registered", created_at: "x" }], service_steps: null });
    expect(r?.service_steps).toBeNull();
    expect(r?.history[0].action_taken).toBeNull();
  });
});

describe("maskedSubject", () => {
  it("hides confidential subjects", () => {
    expect(maskedSubject({ confidential: true, subject: null, office: "City Legal Office" }, t)).toBe("Confidential record held by City Legal Office");
  });
  it("shows the subject otherwise", () => {
    expect(maskedSubject({ confidential: false, subject: "Road permit", office: "X" }, t)).toBe("Road permit");
  });
});
