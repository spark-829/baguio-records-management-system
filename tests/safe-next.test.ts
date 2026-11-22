import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/safe-next";

describe("safeNextPath", () => {
  it("accepts same-site paths", () => {
    expect(safeNextPath("/r/IN-2026-0001")).toBe("/r/IN-2026-0001");
    expect(safeNextPath("/records?x=1")).toBe("/records?x=1");
  });
  it("rejects anything that could leave the site or loop", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/login", "/api/ai/chat", "/mfa", "", null, undefined, "\t/records", "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com","/" + "a".repeat(400)]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
