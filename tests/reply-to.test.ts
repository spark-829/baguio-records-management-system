import { describe, expect, it } from "vitest";
import { parseReplyTo } from "../src/lib/reply-to";

describe("parseReplyTo", () => {
  it("cleans up typed tracking numbers", () => {
    expect(parseReplyTo("in-2026-12")).toBe("IN-2026-0012");
    expect(parseReplyTo(" IN 2026 0012 ")).toBe("IN-2026-0012");
    expect(parseReplyTo("IN–2026–0012")).toBe("IN-2026-0012");
    expect(parseReplyTo("IN-2026-10000")).toBe("IN-2026-10000");
  });
  it("rejects anything else", () => {
    expect(parseReplyTo("OUT-2026-0001")).toBeNull();
    expect(parseReplyTo("")).toBeNull();
    expect(parseReplyTo(null)).toBeNull();
    expect(parseReplyTo("drainage")).toBeNull();
  });
});
