import { describe, expect, it } from "vitest";
import { listSize } from "../src/lib/list-size";

describe("listSize", () => {
  it("falls back to the default", () => {
    for (const v of [undefined, "abc", "-5", "0", "10"]) expect(listSize(v, 50, 500)).toBe(50);
  });
  it("rounds down to a step", () => expect(listSize("120", 50, 500)).toBe(100));
  it("caps at max", () => expect(listSize("9999", 50, 500)).toBe(500));
  it("uses the first array value", () => expect(listSize(["150", "300"], 50, 500)).toBe(150));
});
