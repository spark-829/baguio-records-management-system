import { describe, expect, it } from "vitest";
import { changedSettings } from "../src/lib/settings-diff";

describe("changedSettings", () => {
  it("ignores an unchanged number", () => {
    expect(changedSettings({ a: 5 }, { a: 5 })).toEqual([]);
  });
  it("reports a changed number", () => {
    expect(changedSettings({ a: 5 }, { a: 6 })).toEqual(["a"]);
  });
  it("compares a stored string number", () => {
    expect(changedSettings({ a: "5" }, { a: 5 })).toEqual([]);
    expect(changedSettings({ a: "5" }, { a: 7 })).toEqual(["a"]);
  });
  it("handles flags", () => {
    expect(changedSettings({ f: true }, { f: true })).toEqual([]);
    expect(changedSettings({ f: "true" }, { f: true })).toEqual([]);
    expect(changedSettings({ f: true }, { f: false })).toEqual(["f"]);
    expect(changedSettings({ f: false }, { f: true })).toEqual(["f"]);
  });
  it("treats a missing key as changed", () => {
    expect(changedSettings({}, { a: 5, f: false })).toEqual(["a", "f"]);
  });
});
