import { describe, expect, it } from "vitest";
import { csvDocument, parseCsv } from "../src/lib/csv";

describe("parseCsv", () => {
  it("reads back what csvDocument wrote", () => {
    const rows = [["2026-11", 'City "A", Office', 5, ""], ["2026-11", "B", 0, 80]];
    const out = parseCsv(csvDocument(["Month", "Office", "Responses", "Pct"], rows));
    expect(out).toEqual([["Month", "Office", "Responses", "Pct"], ["2026-11", 'City "A", Office', "5", ""], ["2026-11", "B", "0", "80"]]);
  });
  it("tolerates empty text", () => expect(parseCsv("")).toEqual([]));
});
