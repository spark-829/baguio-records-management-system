import { z } from "zod";
import type { Usage } from "./ai-budget";

export const DEEPSEEK_DEFAULTS = { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" };

export function deepseekConfig(env: Record<string, string | undefined> = process.env) {
  return {
    apiKey: env.SPARK_DEEPSEEK_API ?? "",
    baseUrl: (env.DEEPSEEK_BASE_URL || DEEPSEEK_DEFAULTS.baseUrl).replace(/\/+$/, ""),
    model: env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULTS.model,
  };
}

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public usage: Usage,
    public status?: number,
    public unknownOutcome = false,
  ) {
    super(message);
  }
}

interface RawUsage {
  prompt_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens?: number;
}

function mapUsage(u: RawUsage): Usage {
  const hasSplit = typeof u.prompt_cache_hit_tokens === "number" || typeof u.prompt_cache_miss_tokens === "number";
  return {
    cacheHit: hasSplit ? (u.prompt_cache_hit_tokens ?? 0) : 0,
    cacheMiss: hasSplit ? (u.prompt_cache_miss_tokens ?? 0) : (u.prompt_tokens ?? 0),
    output: u.completion_tokens ?? 0,
  };
}

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/** Calls DeepSeek chat completions in JSON mode with plain fetch. Never logs the key. */
export async function deepseekJson<T>(o: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  maxTokens: number;
  maxTokensCap: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ data: T; usage: Usage; attempts: number }> {
  const doFetch = o.fetchImpl ?? fetch;
  const total: Usage = { cacheHit: 0, cacheMiss: 0, output: 0 };
  let maxTokens = o.maxTokens;
  let sendThinking = true;
  let thinkingRetryUsed = false;
  let lengthRetryUsed = false;
  let jsonRetryUsed = false;
  let attempts = 0;

  while (attempts < 4) {
    attempts += 1;
    const body: Record<string, unknown> = {
      model: o.model,
      messages: o.messages,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      stream: false,
    };
    if (sendThinking) body.thinking = { type: "disabled" };

    let res: Response;
    try {
      res = await doFetch(`${o.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 20000),
      });
    } catch {
      throw new DeepSeekError("The AI service did not answer", { ...total }, undefined, true);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 400 && /thinking/i.test(text) && sendThinking && !thinkingRetryUsed) {
        thinkingRetryUsed = true;
        sendThinking = false;
        continue;
      }
      throw new DeepSeekError(`AI service error ${res.status}`, { ...total }, res.status);
    }

    let json: {
      usage?: RawUsage;
      choices?: { finish_reason?: string; message?: { content?: string | null } }[];
    };
    try {
      json = await res.json();
    } catch {
      throw new DeepSeekError("The AI answer could not be read", { ...total }, res.status, true);
    }
    if (json.usage && typeof json.usage === "object") {
      const u = mapUsage(json.usage);
      total.cacheHit += u.cacheHit;
      total.cacheMiss += u.cacheMiss;
      total.output += u.output;
    }
    const choice = json.choices?.[0];

    if (choice?.finish_reason === "length" && !lengthRetryUsed) {
      lengthRetryUsed = true;
      const next = Math.min(o.maxTokensCap, maxTokens * 2);
      if (next > maxTokens) {
        maxTokens = next;
        continue;
      }
    }

    let content = (choice?.message?.content ?? "").trim();
    const fenced = content.match(FENCE);
    if (fenced) content = fenced[1];
    let parsed: z.ZodSafeParseResult<T> | null = null;
    try {
      parsed = o.schema.safeParse(JSON.parse(content));
    } catch {
      parsed = null;
    }
    if (parsed?.success) return { data: parsed.data, usage: total, attempts };
    if (!jsonRetryUsed) {
      jsonRetryUsed = true;
      continue;
    }
    throw new DeepSeekError("The AI answer could not be read", { ...total });
  }
  throw new DeepSeekError("The AI answer could not be read", { ...total });
}
