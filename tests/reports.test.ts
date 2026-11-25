import { describe, expect, it } from "vitest";
import { monthLabel, onTimeSummary, parseOnTime, parseRetention, parseSummary, percent, reportBounds, statusBars, toBars } from "../src/lib/reports";
import { fetchPages } from "../src/lib/fetch-pages";

describe("reportBounds", () => {
  it("turns a date range into UTC instants, end exclusive", () => {
    expect(reportBounds("2026-01-01", "2026-01-31")).toEqual({ from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" });
    expect(reportBounds(undefined, "2024-02-28")).toEqual({ from: null, to: "2024-02-29T00:00:00.000Z" });
  });
  it("ignores empty or bad input", () => {
    expect(reportBounds()).toEqual({ from: null, to: null });
    expect(reportBounds("", "")).toEqual({ from: null, to: null });
    expect(reportBounds("2026-13-40", "abc")).toEqual({ from: null, to: null });
  });
});

describe("toBars", () => {
  it("merges equal labels, sorts biggest first, keeps order on ties", () => {
    const out = toBars(
      [{ key: "a", n: 1 }, { key: "b", n: 2 }, { key: "c", n: 1 }, { key: "d", n: 1 }],
      (k) => (k === "d" ? "a" : k),
    );
    expect(out).toEqual([{ label: "a", n: 2 }, { label: "b", n: 2 }, { label: "c", n: 1 }]);
  });
});

describe("monthLabel", () => {
  it("formats a year-month", () => expect(monthLabel("2026-11")).toBe("Nov 2026"));
});

describe("parseSummary / parseRetention", () => {
  it("gives zeros and empty lists for null", () => {
    const s = parseSummary(null);
    expect(s.total).toBe(0);
    expect(s.by_status).toEqual([]);
    expect(s.overdue_rows).toEqual([]);
    expect(parseRetention(null)).toEqual({ counts: { review_now: 0, review_soon: 0, keep: 0 }, rows: [] });
  });
  it("coerces string counts", () => {
    const s = parseSummary({ total: "12", overdue: "3", by_month: [{ key: "2026-11", n: "4" }] });
    expect(s.total).toBe(12);
    expect(s.overdue).toBe(3);
    expect(s.by_month).toEqual([{ key: "2026-11", n: 4 }]);
    expect(s.by_tx).toEqual([]);
    expect(parseSummary({ by_tx: [{ key: "G2C", n: "2" }] }).by_tx).toEqual([{ key: "G2C", n: 2 }]);
    expect(parseRetention({ keep: "5", rows: [] }).counts.keep).toBe(5);
  });
});

describe("fetchPages", () => {
  const make = (total: number) => {
    const calls: [number, number][] = [];
    const fetchPage = async (from: number, to: number) => {
      calls.push([from, to]);
      const data = Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i);
      return { data, error: null };
    };
    return { calls, fetchPage };
  };
  it("stops at the first short page", async () => {
    const { calls, fetchPage } = make(2500);
    const r = await fetchPages(fetchPage);
    expect(r.data).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("makes one more call after an exact full page", async () => {
    const { calls, fetchPage } = make(1000);
    expect((await fetchPages(fetchPage)).data).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });
  it("caps the number of pages", async () => {
    const { calls, fetchPage } = make(100000);
    expect((await fetchPages(fetchPage)).data).toHaveLength(6000);
    expect(calls).toHaveLength(6);
  });
  it("returns the error", async () => {
    const r = await fetchPages<number>(async () => ({ data: null, error: new Error("x") }));
    expect(r.error).toBeTruthy();
    expect(r.data).toEqual([]);
  });
});

describe("on-time report", () => {
  it("drops junk and zero rows", () => {
    expect(parseOnTime(null)).toEqual([]);
    expect(parseOnTime([{ id: "a", name: "A", finished: "4", on_time: "3" }, { id: "b", name: "B", finished: 0, on_time: 0 }, null])).toEqual([{ id: "a", name: "A", finished: 4, on_time: 3 }]);
  });
  it("computes percentages", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBeNull();
  });
  it("totals and sorts lowest first", () => {
    const s = onTimeSummary([
      { id: "a", name: "Zeta", finished: 4, on_time: 4 },
      { id: "b", name: "Alpha", finished: 4, on_time: 1 },
    ]);
    expect(s).toMatchObject({ finished: 8, on_time: 5, pct: 63 });
    expect(s.offices.map((o) => o.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("statusBars", () => {
  const id = (k: string) => k;
  it("uses workflow order, not count order", () => {
    expect(statusBars([{ key: "archived", n: 9 }, { key: "registered", n: 1 }, { key: "under_action", n: 5 }], id)).toEqual([
      { label: "registered", n: 1 },
      { label: "under_action", n: 5 },
      { label: "archived", n: 9 },
    ]);
  });
  it("sums duplicates", () => {
    expect(statusBars([{ key: "received", n: 2 }, { key: "received", n: 3 }], id)).toEqual([{ label: "received", n: 5 }]);
  });
  it("puts unknown keys after known ones", () => {
    expect(statusBars([{ key: "weird", n: 4 }, { key: "completed", n: 1 }], id)).toEqual([{ label: "completed", n: 1 }, { label: "weird", n: 4 }]);
  });
  it("leaves out statuses with no data and applies the label function", () => {
    expect(statusBars([{ key: "released", n: 2 }], (k) => k.toUpperCase())).toEqual([{ label: "RELEASED", n: 2 }]);
  });
});
