import { describe, expect, it } from "vitest";
import { formTarget, isNavigationClick } from "../src/lib/nav-progress";

const here = "https://rms.test/records?q=a";
const link = (href: string, attrs: Record<string, string> = {}) => ({ href, target: attrs.target ?? "", hasAttribute: (n: string) => n in attrs });
const click = (o: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

describe("isNavigationClick", () => {
  it("counts a plain click to another page or another query", () => {
    expect(isNavigationClick(link("/reports"), click(), here)).toBe(true);
    expect(isNavigationClick(link("/records?q=b"), click(), here)).toBe(true);
  });
  it("ignores the same page, #sections and other sites", () => {
    expect(isNavigationClick(link("/records?q=a"), click(), here)).toBe(false);
    expect(isNavigationClick(link("/records?q=a#list"), click(), here)).toBe(false);
    expect(isNavigationClick(link("https://example.com/"), click(), here)).toBe(false);
    expect(isNavigationClick(link("/api/reports/csv?report=released"), click(), here)).toBe(false);
  });
  it("ignores new tabs, downloads and modified clicks", () => {
    expect(isNavigationClick(link("/reports", { target: "_blank" }), click(), here)).toBe(false);
    expect(isNavigationClick(link("/export.csv", { download: "" }), click(), here)).toBe(false);
    expect(isNavigationClick(link("/reports"), click({ ctrlKey: true }), here)).toBe(false);
    expect(isNavigationClick(link("/reports"), click({ button: 1 }), here)).toBe(false);
  });
});

describe("formTarget", () => {
  it("builds the search URL and skips a search that changes nothing", () => {
    expect(formTarget("/records", [["q", "b"]], here)).toBe("https://rms.test/records?q=b");
    expect(formTarget("/records", [["q", "a"]], here)).toBeNull();
    expect(formTarget("/reports", [], here)).toBe("https://rms.test/reports");
  });
});
