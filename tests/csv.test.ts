import { describe, expect, it } from "vitest";
import { csvCell, csvDocument } from "../src/lib/csv";

describe("csv", () => {
  it("prefixes formula starters", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("-5")).toBe(`"'-5"`);
  });
  it("escapes quotes and blanks nulls", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });
  it("starts with a BOM and uses CRLF", () => {
    const d = csvDocument(["a", "b"], [[1, 2]]);
    expect(d.startsWith("﻿")).toBe(true);
    expect(d).toBe('﻿"a","b"\r\n"1","2"');
  });
});
