/**
 * Pure helpers for the AI spending cap: prices, peak hours, cost, cost estimates, cache keys.
 * No imports, so tests can load it directly. The real cap is enforced in the database (rms_ai_reserve).
 */
export const HARD_CAP_USD = 0.33;
/** USD per 1M tokens */
export const PRICES_DEFAULT = { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 };

export type Prices = typeof PRICES_DEFAULT;

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function prices(env: Record<string, string | undefined> = process.env): Prices {
  return {
    cacheHit: positive(env.DEEPSEEK_PRICE_CACHE_HIT, PRICES_DEFAULT.cacheHit),
    cacheMiss: positive(env.DEEPSEEK_PRICE_CACHE_MISS, PRICES_DEFAULT.cacheMiss),
    output: positive(env.DEEPSEEK_PRICE_OUTPUT, PRICES_DEFAULT.output),
  };
}

export interface Usage {
  cacheHit: number;
  cacheMiss: number;
  output: number;
}

/** Mon-Fri, 01:00-04:00 and 06:00-10:00 UTC are billed at double. */
export function isPeakUtc(at: Date): boolean {
  const day = at.getUTCDay();
  if (day < 1 || day > 5) return false;
  const h = at.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

export function costUsd(u: Usage, at: Date, p: Prices = prices()): number {
  const base = (u.cacheHit * p.cacheHit + u.cacheMiss * p.cacheMiss + u.output * p.output) / 1e6;
  return base * (isPeakUtc(at) ? 2 : 1);
}

export const IMAGE_TOKEN_ESTIMATE = 8000;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export function estimateInputTokens(messages: { content: string | Part[] }[]): number {
  let chars = 0;
  let images = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const p of m.content) {
        if (p.type === "text") chars += p.text.length;
        else images += 1;
      }
  }
  return Math.ceil(chars / 2) + images * IMAGE_TOKEN_ESTIMATE;
}

/** Worst case: 3 billable attempts (first try, length retry, bad-JSON retry), always priced at peak (x2). */
export function estimateMaxCostUsd(o: { inputTokens: number; maxTokens: number; maxTokensCap: number }, p: Prices = prices()): number {
  return ((3 * o.inputTokens * p.cacheMiss + (o.maxTokens + 2 * o.maxTokensCap) * p.output) / 1e6) * 2;
}

export function clampCap(setting: unknown): number {
  const n = Number(setting);
  const v = setting !== null && setting !== "" && Number.isFinite(n) && n >= 0 ? n : HARD_CAP_USD;
  return Math.min(v, HARD_CAP_USD);
}

/** Mirrors the SQL check: a call may start only while spent + estimate stays below the cap. */
export function withinBudget(spent: number, estimate: number, cap: number): boolean {
  return spent + estimate < cap;
}

export function normalizeQuery(q: string): string {
  return q.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "").trim();
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function cacheKey(secret: string, feature: "intake" | "search", data: Uint8Array | string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const sig = await crypto.subtle.sign("HMAC", key, bytes as BufferSource);
  return `${feature}:${hex(sig)}`;
}
