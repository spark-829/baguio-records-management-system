import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { AiUnavailableError, searchRequest, todayManila, type AiRequest } from "./ai";
import { cacheKey, costUsd, estimateInputTokens, estimateMaxCostUsd, normalizeQuery } from "./ai-budget";
import { searchModelSchema, type SearchAi } from "./ai-schemas";
import { DeepSeekError, deepseekConfig, deepseekJson } from "./deepseek";

export type DemoReason = "budget" | "rate_limited" | "error";
export const DEMO_NOTES: Record<DemoReason, string> = {
  budget: "AI budget for the demo is used up; showing demo suggestion.",
  rate_limited: "You have reached the AI limit for now (20 an hour, 60 a day); showing demo suggestion.",
  error: "The AI service is not available right now; showing demo suggestion.",
};
export { PDF_NOTE } from "./image-size";

export type AiOutcome<T> =
  | { mode: "ai"; data: T; cached?: boolean }
  | { mode: "demo"; reason: DemoReason; note: string };

const demo = (reason: DemoReason): AiOutcome<never> => ({ mode: "demo", reason, note: DEMO_NOTES[reason] });

async function finalize(
  supabase: SupabaseClient,
  id: string,
  ok: boolean,
  usage: { cacheHit: number; cacheMiss: number; output: number },
  cost: number,
) {
  try {
    const { error } = await supabase.rpc("rms_ai_finalize", {
      p_id: id,
      p_ok: ok,
      p_cache_hit: usage.cacheHit,
      p_cache_miss: usage.cacheMiss,
      p_output: usage.output,
      p_cost_usd: cost,
    });
    if (error) console.error("AI finalize failed:", error.message);
  } catch (e) {
    console.error("AI finalize failed:", e instanceof Error ? e.message : "unknown");
  }
}

/** Reserve budget in the database, call DeepSeek, then record the real cost. Fails closed: no reservation, no call. */
export async function runAi<T>(supabase: SupabaseClient, req: AiRequest<T>): Promise<AiOutcome<T>> {
  const cfg = deepseekConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("AI is not configured on this server (SPARK_DEEPSEEK_API is missing).");
  // The database accepts budget calls only with the server-held proxy key (QA-015).
  // Until RMS_PROXY_KEY is set on the worker, AI falls back to the demo suggestion.
  if (!process.env.RMS_PROXY_KEY) {
    console.error("AI skipped: RMS_PROXY_KEY is not set on this server");
    return demo("error");
  }
  const estimate = estimateMaxCostUsd({
    inputTokens: estimateInputTokens(req.messages),
    maxTokens: req.maxTokens,
    maxTokensCap: req.maxTokensCap,
  });
  const { data: r, error } = await supabase.rpc("rms_ai_reserve", {
    p_feature: req.feature,
    p_model: cfg.model,
    p_estimate_usd: estimate,
  });
  if (error || !r) {
    console.error("AI reserve failed:", error?.message ?? "no result");
    return demo("error");
  }
  if (!r.ok) return demo(r.reason === "rate_limited" ? "rate_limited" : r.reason === "budget" ? "budget" : "error");

  const startedAt = new Date();
  try {
    const out = await deepseekJson({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      messages: req.messages,
      schema: req.schema,
      maxTokens: req.maxTokens,
      maxTokensCap: req.maxTokensCap,
      timeoutMs: req.timeoutMs,
    });
    await finalize(supabase, r.id, true, out.usage, Math.max(costUsd(out.usage, startedAt), costUsd(out.usage, new Date())));
    return { mode: "ai", data: out.data };
  } catch (e) {
    if (e instanceof DeepSeekError) {
      console.error("AI call failed:", e.message);
      await finalize(supabase, r.id, false, e.usage, e.unknownOutcome ? estimate : Math.max(costUsd(e.usage, startedAt), costUsd(e.usage, new Date())));
      return demo("error");
    }
    await finalize(supabase, r.id, false, { cacheHit: 0, cacheMiss: 0, output: 0 }, estimate);
    throw e;
  }
}

export async function cacheGet<T>(supabase: SupabaseClient, key: string, schema: z.ZodType<T>): Promise<T | null> {
  const { data, error } = await supabase.rpc("rms_ai_cache_get", { p_key: key });
  if (error || data == null) return null;
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function cachePut(supabase: SupabaseClient, key: string, feature: "intake" | "search", result: unknown) {
  try {
    await supabase.rpc("rms_ai_cache_put", { p_key: key, p_feature: feature, p_result: result });
  } catch {
    /* the cache is optional */
  }
}

/** Plain-language search filters, cached per normalized query and Manila date. Shared by search and chat. */
export async function getSearchFilters(
  supabase: SupabaseClient,
  query: string,
  offices: { code: string; name: string }[],
  docTypes: string[],
): Promise<AiOutcome<SearchAi>> {
  const cfg = deepseekConfig();
  const key = await cacheKey(cfg.apiKey, "search", `${todayManila()}|${normalizeQuery(query)}`);
  const hit = await cacheGet(supabase, key, searchModelSchema);
  if (hit) return { mode: "ai", data: hit, cached: true };
  const out = await runAi(supabase, searchRequest(query, offices, docTypes));
  if (out.mode === "ai") await cachePut(supabase, key, "search", out.data);
  return out;
}
