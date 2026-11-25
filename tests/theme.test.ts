import { describe, expect, it } from "vitest";
import { themeFor } from "../src/lib/theme";

describe("themeFor", () => {
  it("gives the city theme to CGSO", () => {
    expect(themeFor("CGSO")).toBe("city");
  });
  it("gives nothing to other offices or no office", () => {
    expect(themeFor("CMO")).toBeUndefined();
    expect(themeFor(null)).toBeUndefined();
    expect(themeFor(undefined)).toBeUndefined();
  });
});
