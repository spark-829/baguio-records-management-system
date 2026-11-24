import { describe, expect, it } from "vitest";
import {
  fullBuckets,
  dayText, findingText, labelIndexes, niceTicks, pct, perWeek, periodDays, pileText, quintileCuts, quintileIndex, rankOffices, viewMode,
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

describe("quintiles", () => {
  it("returns no cuts for no values", () => {
    expect(quintileCuts([])).toEqual([]);
    expect(quintileCuts([0, -1])).toEqual([]);
  });
  it("cuts 1..10", () => {
    const cuts = quintileCuts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cuts).toEqual([2, 4, 6, 8]);
    expect(quintileIndex(1, cuts)).toBe(0);
    expect(quintileIndex(3, cuts)).toBe(1);
    expect(quintileIndex(10, cuts)).toBe(4);
  });
  it("all-equal values land in the lowest group", () => {
    const cuts = quintileCuts([5, 5, 5, 5]);
    expect(cuts).toEqual([5, 5, 5, 5]);
    expect(quintileIndex(5, cuts)).toBe(0);
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
