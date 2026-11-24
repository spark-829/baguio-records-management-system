import { describe, expect, it } from "vitest";
import { boxUrl, parseScannedText, scanPath, scanUrl } from "../src/lib/qr";

describe("scan urls", () => {
  it("uppercases and trims the slash on the origin", () => {
    expect(scanPath("in-2026-0001")).toBe("/r/IN-2026-0001");
    expect(scanUrl("https://rms.test/", "in-2026-0001")).toBe("https://rms.test/r/IN-2026-0001");
  });
});

describe("parseScannedText", () => {
  it("reads a full slip URL as an internal path", () => {
    expect(parseScannedText("https://rms.test/r/IN-2026-0001")).toBe("/r/IN-2026-0001");
  });
  it("never leaves the site, even for a foreign host", () => {
    expect(parseScannedText("https://evil.test/r/OUT-2026-0042")).toBe("/r/OUT-2026-0042");
    expect(parseScannedText("https://evil.test/anything")).toBeNull();
  });
  it("accepts a bare tracking number", () => {
    expect(parseScannedText(" out-2026-0007 ")).toBe("/r/OUT-2026-0007");
  });
  it("accepts old slips pointing at /records/<uuid>", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseScannedText(`https://rms.test/records/${id}`)).toBe(`/records/${id}`);
  });
  it("reads a box URL as an internal path", () => {
    const id = "123E4567-E89B-12D3-A456-426614174000";
    expect(parseScannedText(`https://rms.test/boxes/${id}`)).toBe(`/boxes/${id.toLowerCase()}`);
    expect(parseScannedText("https://rms.test/boxes/not-a-uuid")).toBeNull();
  });
  it("builds a box url", () => {
    expect(boxUrl("https://rms.test/", "123E4567-E89B-12D3-A456-426614174000")).toBe("https://rms.test/boxes/123e4567-e89b-12d3-a456-426614174000");
  });
  it("rejects scripts and random text", () => {
    expect(parseScannedText("javascript:alert(1)")).toBeNull();
    expect(parseScannedText("hello world")).toBeNull();
  });
});
