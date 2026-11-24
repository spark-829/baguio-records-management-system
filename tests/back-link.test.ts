import { describe, expect, it } from "vitest";
import { listQuery, recordsBackHref } from "../src/lib/back-link";
import { filtersFromParams } from "../src/lib/search";

describe("recordsBackHref", () => {
  it("falls back to /records when empty", () => {
    expect(recordsBackHref(undefined)).toBe("/records");
    expect(recordsBackHref("")).toBe("/records");
    expect(recordsBackHref([])).toBe("/records");
  });
  it("keeps known filters", () => {
    expect(recordsBackHref("q=road&status=forwarded")).toBe("/records?q=road&status=forwarded");
  });
  it("drops unknown keys", () => {
    expect(recordsBackHref("q=a&ai=x&evil=1")).toBe("/records?q=a");
  });
  it("cannot be an open redirect", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      const href = recordsBackHref(bad);
      expect(href).toBe("/records");
      expect(href.startsWith("//")).toBe(false);
    }
  });
  it("handles the list size", () => {
    expect(recordsBackHref("q=a&n=100")).toBe("/records?q=a&n=100");
    expect(recordsBackHref("q=a&n=50")).toBe("/records?q=a");
    expect(recordsBackHref("q=a&n=9999")).toBe("/records?q=a&n=500");
    expect(recordsBackHref("q=a&n=abc")).toBe("/records?q=a");
  });
  it("uses the first of an array", () => {
    expect(recordsBackHref(["q=a", "q=b"])).toBe("/records?q=a");
  });
  it("rejects very long values", () => {
    expect(recordsBackHref("q=" + "a".repeat(2001))).toBe("/records");
  });
  it("round trips through encoding", () => {
    const qs = listQuery(filtersFromParams({ q: "road & bridge", office: "CEO", here: "1", open: "1" }), 100);
    expect(recordsBackHref(decodeURIComponent(encodeURIComponent(qs)))).toBe(`/records?${qs}`);
  });
  it("listQuery is empty with no filters", () => {
    expect(listQuery(filtersFromParams({}), 50)).toBe("");
  });
});
