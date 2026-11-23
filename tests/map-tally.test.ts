import { describe, expect, it } from "vitest";
import { tallyBarangays } from "../src/lib/map-tally";

describe("tallyBarangays", () => {
  it("counts records and late ones per barangay", () => {
    expect(
      tallyBarangays([
        { barangay: "A", late: true },
        { barangay: "A", late: false },
        { barangay: "B", late: false },
      ]),
    ).toEqual({ A: { n: 2, late: 1 }, B: { n: 1, late: 0 } });
  });
  it("skips empty names", () => expect(tallyBarangays([{ barangay: "", late: true }])).toEqual({}));
  it("handles empty input", () => expect(tallyBarangays([])).toEqual({}));
});
