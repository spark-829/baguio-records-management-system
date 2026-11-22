import { describe, expect, it } from "vitest";
import { HARD_CAP_USD, cacheKey, clampCap, costUsd, estimateInputTokens, estimateMaxCostUsd, isPeakUtc, normalizeQuery, prices, withinBudget } from "../src/lib/ai-budget";

// 2026-11-23 is a Monday, 2026-11-28 a Saturday
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, day, h, m));

describe("isPeakUtc", () => {
  it("covers the peak windows on weekdays only", () => {
    expect(isPeakUtc(at(23, 0, 59))).toBe(false);
    expect(isPeakUtc(at(23, 1))).toBe(true);
    expect(isPeakUtc(at(23, 3, 59))).toBe(true);
    expect(isPeakUtc(at(23, 4))).toBe(false);
    expect(isPeakUtc(at(23, 6))).toBe(true);
    expect(isPeakUtc(at(23, 9, 59))).toBe(true);
    expect(isPeakUtc(at(23, 10))).toBe(false);
    expect(isPeakUtc(at(28, 2))).toBe(false);
  });
});

describe("costUsd", () => {
  const u = { cacheHit: 1000, cacheMiss: 2000, output: 500 };
  it("prices off-peak and doubles at peak", () => {
    expect(costUsd(u, at(23, 12))).toBeCloseTo(0.000603, 9);
    expect(costUsd(u, at(23, 2))).toBeCloseTo(0.001206, 9);
  });
  it("accepts env price overrides and ignores junk", () => {
    expect(prices({ DEEPSEEK_PRICE_OUTPUT: "1.2" }).output).toBe(1.2);
    expect(prices({ DEEPSEEK_PRICE_OUTPUT: "-1", DEEPSEEK_PRICE_CACHE_MISS: "abc" })).toEqual(prices({}));
    expect(costUsd(u, at(23, 12), prices({ DEEPSEEK_PRICE_OUTPUT: "1.2" }))).toBeCloseTo(0.000903, 9);
  });
});

describe("estimates", () => {
  it("counts an image as 8000 tokens and ignores data-URL length", () => {
    const n = estimateInputTokens([
      { content: "abcd" },
      { content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64," + "A".repeat(100000) } }, { type: "text", text: "hello world!" }] },
    ]);
    expect(n).toBe(2 + 6 + 8000);
  });
  it("estimates the worst case at peak with three attempts", () => {
    const p = prices({});
    const e = estimateMaxCostUsd({ inputTokens: 1000, maxTokens: 100, maxTokensCap: 200 }, p);
    expect(e).toBeCloseTo(((3 * 1000 * 0.15 + 500 * 0.6) / 1e6) * 2, 12);
  });
});

describe("cap", () => {
  it("clamps the setting to the hard cap", () => {
    expect(clampCap("5")).toBe(HARD_CAP_USD);
    expect(clampCap(0.1)).toBe(0.1);
    expect(clampCap("junk")).toBe(HARD_CAP_USD);
    expect(clampCap(null)).toBe(HARD_CAP_USD);
    expect(clampCap(-1)).toBe(HARD_CAP_USD);
  });
  it("withinBudget needs spent + estimate strictly below the cap", () => {
    expect(withinBudget(0.1, 0.02, 0.33)).toBe(true);
    expect(withinBudget(0.31, 0.02, 0.33)).toBe(false);
    expect(withinBudget(0.5, 0.5, 1)).toBe(false);
    expect(withinBudget(0.5, 0.25, 1)).toBe(true);
  });
});

describe("normalizeQuery and cacheKey", () => {
  it("normalizes case, spacing and trailing punctuation", () => {
    expect(normalizeQuery("  Where   is the ＲＯＡＤ memo?! ")).toBe("where is the road memo");
  });
  it("makes stable, secret-dependent, prefixed keys", async () => {
    const a = await cacheKey("s1", "intake", new Uint8Array([1, 2, 3]));
    expect(a).toMatch(/^intake:[0-9a-f]{64}$/);
    expect(await cacheKey("s1", "intake", new Uint8Array([1, 2, 3]))).toBe(a);
    expect(await cacheKey("s2", "intake", new Uint8Array([1, 2, 3]))).not.toBe(a);
    expect(await cacheKey("s1", "search", "x")).toMatch(/^search:/);
  });
});
