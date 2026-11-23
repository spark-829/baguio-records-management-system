import { describe, expect, it } from "vitest";
import { foundText } from "../src/lib/list-size";

describe("foundText", () => {
  it("shows an exact count when the list is not capped", () => {
    expect(foundText(1, false, false)).toBe("{n} record found");
    expect(foundText(7, false, true)).toBe("{n} open records found");
  });
  it("says N+ when more exist", () => {
    expect(foundText(50, true, false)).toMatch(/^\{n\}\+ records found/);
    expect(foundText(50, true, true)).toMatch(/^\{n\}\+ open records/);
  });
});
