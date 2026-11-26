import { describe, expect, it } from "vitest";
import { isSameOrigin } from "../src/lib/same-origin";

const h = (o: Record<string, string>) => new Headers(o);
const SITE = "https://rms.example";

describe("isSameOrigin", () => {
  it("accepts the site's own Origin", () => {
    expect(isSameOrigin(h({ host: "rms.example", origin: SITE }), SITE)).toBe(true);
  });
  it("refuses a foreign or null Origin", () => {
    expect(isSameOrigin(h({ host: "rms.example", origin: "https://evil.test" }), SITE)).toBe(false);
    expect(isSameOrigin(h({ host: "rms.example", origin: "null" }), SITE)).toBe(false);
  });
  it("falls back to Sec-Fetch-Site, then Referer", () => {
    expect(isSameOrigin(h({ host: "rms.example", "sec-fetch-site": "same-origin" }), SITE)).toBe(true);
    expect(isSameOrigin(h({ host: "rms.example", "sec-fetch-site": "cross-site" }), SITE)).toBe(false);
    expect(isSameOrigin(h({ host: "rms.example", referer: `${SITE}/records` }), SITE)).toBe(true);
    expect(isSameOrigin(h({ host: "rms.example", referer: "https://evil.test/" }), SITE)).toBe(false);
  });
  it("refuses a request with no origin signals", () => {
    expect(isSameOrigin(h({ host: "rms.example" }), SITE)).toBe(false);
  });
});
