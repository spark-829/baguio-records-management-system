import { describe, expect, it } from "vitest";
import { cleanRefNo, DEFAULT_REF_LABEL } from "../src/lib/reference-no";

describe("cleanRefNo", () => {
  it("trims", () => expect(cleanRefNo("  OR-123 ")).toEqual({ ok: "OR-123" }));
  it("blank means none", () => {
    expect(cleanRefNo("   ")).toEqual({ ok: null });
    expect(cleanRefNo(null)).toEqual({ ok: null });
    expect(cleanRefNo(undefined)).toEqual({ ok: null });
  });
  it("allows 40 characters, rejects 41", () => {
    expect(cleanRefNo("a".repeat(40))).toEqual({ ok: "a".repeat(40) });
    expect(cleanRefNo("a".repeat(41))).toEqual({ error: "Keep the reference number under 40 characters." });
  });
  it("has a default label", () => expect(DEFAULT_REF_LABEL).toBe("Reference no. from another system"));
});
