import { describe, expect, it } from "vitest";
import {
  fullBuckets,
  dayText, findingText, labelIndexes, niceTicks, pct, perWeek, periodDays, pileText, openPile, topWithOther, kpiCompare, rankOffices, viewMode,
} from "../src/lib/flow-analytics";
import type { OfficeFlow } from "../src/lib/flow-analytics";

const office = (name: string, visits: number, waitDays: number, transitDays: number): OfficeFlow => ({
  id: name, code: name, name, visits, records: visits, waitDays, transitDays, medianWait: null, p90Wait: null, medianHandoff: null,
});

describe("params", () => {
  it("periodDays", () => {
    expect(periodDays("30")).toBe(30);
    expect(periodDays("365")).toBe(365);
    expect(periodDays("7")).toBe(90);
    expect(periodDays(undefined)).toBe(90);
    expect(periodDays(["90"])).toBe(90);
    expect(periodDays(["30"])).toBe(30);
  });
  it("viewMode", () => {
    expect(viewMode("days")).toBe("days");
    expect(viewMode("sent")).toBe("sent");
    expect(viewMode("x")).toBe("sent");
    expect(viewMode(undefined)).toBe("sent");
  });
});

describe("rankOffices", () => {
  const ranked = rankOffices([office("B", 3, 20, 5), office("Z", 0, 0, 0), office("A", 10, 80, 20), office("C", 0, 0, 0)]);
  it("sorts by share with empty offices last, by name", () => {
    expect(ranked.map((o) => o.name)).toEqual(["A", "B", "C", "Z"]);
  });
  it("shares sum to 100 and desk + transit = share", () => {
    expect(ranked.reduce((a, o) => a + o.share, 0)).toBeCloseTo(100);
    for (const o of ranked) expect(o.deskPct + o.transitPct).toBeCloseTo(o.share);
  });
  it("handles no waiting time", () => {
    expect(rankOffices([office("A", 0, 0, 0)])[0].share).toBe(0);
  });
});

describe("niceTicks", () => {
  it("works", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(5)).toEqual([0, 2, 4, 6]);
  });
});

describe("labelIndexes", () => {
  it("keeps the ends and at most 6", () => {
    const l = labelIndexes(13);
    expect(l).toContain(0);
    expect(l).toContain(12);
    expect(l.length).toBeLessThanOrEqual(6);
    expect(labelIndexes(4)).toEqual([0, 1, 2, 3]);
  });
});

describe("text helpers", () => {
  it("dayText", () => {
    expect(dayText(null)).toBeNull();
    expect(dayText(0.4)).toEqual({ key: "less than a day", vars: {} });
    expect(dayText(1.2)).toEqual({ key: "{n} day", vars: { n: 1 } });
    expect(dayText(6.4)).toEqual({ key: "{n} days", vars: { n: 6 } });
  });
  it("findingText", () => {
    expect(findingText(null).key).toMatch(/^Too few records/);
    expect(findingText({ visits: 4, share: 50 }).key).toMatch(/^Too few records/);
    expect(findingText({ visits: 9, share: 0 }).key).toMatch(/^Too few records/);
    expect(findingText({ visits: 9, share: 41.4 })).toEqual({
      key: "Records wait longest at {office}: {share}% of all waiting time in the last {period}, usually {days} each.",
      vars: { share: 41 },
    });
  });
  it("pileText", () => {
    expect(pileText(10, 4).key).toContain("grew by");
    expect(pileText(4, 10)).toEqual({ key: "{logged} logged, {finished} finished: the open pile shrank by {n}.", vars: { logged: 4, finished: 10, n: 6 } });
    expect(pileText(5, 5).key).toContain("stayed the same");
  });
  it("pct and perWeek", () => {
    expect(pct(1, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33);
    expect(perWeek(30, 90)).toBe(2.3);
  });
});

describe("fullBuckets", () => {
  it("drops the partial first and last buckets", () => {
    expect(fullBuckets([1, 2, 3, 4])).toEqual([2, 3]);
    expect(fullBuckets([1, 2])).toEqual([1, 2]);
    expect(fullBuckets([])).toEqual([]);
  });
});

describe("openPile", () => {
  it("start equals prevOpen for a consistent example", () => {
    const pts = openPile([{ logged: 300, finished: 200 }, { logged: 424, finished: 487 }], 150);
    expect(pts).toEqual([113, 213, 150]);
  });
  it("clamps at 0", () => {
    expect(openPile([{ logged: 0, finished: 0 }, { logged: 50, finished: 0 }], 10)).toEqual([0, 0, 10]);
  });
  it("no buckets gives openNow only", () => {
    expect(openPile([], 7)).toEqual([7]);
  });
});

describe("topWithOther", () => {
  const rows = [{ n: "a", v: 5, w: 1 }, { n: "b", v: 9, w: 2 }, { n: "c", v: 1, w: 3 }, { n: "d", v: 2, w: 4 }];
  it("no other when all fit", () => {
    const r = topWithOther(rows, 4, "v");
    expect(r.other).toBeNull();
    expect(r.top.map((x) => x.n)).toEqual(["b", "a", "d", "c"]);
  });
  it("sums the rest", () => {
    const r = topWithOther(rows, 2, "v");
    expect(r.top.map((x) => x.n)).toEqual(["b", "a"]);
    expect(r.other).toMatchObject({ count: 2, v: 3, w: 7 });
  });
});

describe("kpiCompare", () => {
  it("lower is better", () => {
    expect(kpiCompare(150, 113, "lower")).toBe("worse");
    expect(kpiCompare(100, 113, "lower")).toBe("better");
  });
  it("higher is better", () => {
    expect(kpiCompare(80, 70, "higher")).toBe("better");
    expect(kpiCompare(60, 70, "higher")).toBe("worse");
  });
  it("same compares rounded values", () => {
    expect(kpiCompare(2.2, 2.4, "lower")).toBe("same");
  });
  it("null previous", () => {
    expect(kpiCompare(5, null, "lower")).toBe("none");
  });
});
