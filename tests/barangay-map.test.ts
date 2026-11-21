import { describe, expect, it } from "vitest";
import { BARANGAYS, steps } from "../src/lib/baguio-map";

describe("barangay map", () => {
  it("has every Baguio barangay once", () => {
    const names = BARANGAYS.map((b) => b.name);
    expect(names.length).toBe(129);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Irisan");
  });

  it("legend steps cover 1 to the busiest barangay without gaps", () => {
    for (const max of [1, 3, 5, 11, 40]) {
      const s = steps(max);
      expect(s[0][0]).toBe(1);
      expect(s[s.length - 1][1]).toBe(max);
      for (let i = 1; i < s.length; i++) expect(s[i][0]).toBe(s[i - 1][1] + 1);
    }
    expect(steps(0)).toEqual([]);
  });
});
