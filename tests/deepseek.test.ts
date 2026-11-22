import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DeepSeekError, deepseekConfig, deepseekJson } from "../src/lib/deepseek";

const schema = z.object({ ok: z.literal(true) });
const base = { apiKey: "sk-test", baseUrl: "https://example.test", model: "m", messages: [{ role: "user" as const, content: "hi" }], schema, maxTokens: 100, maxTokensCap: 300 };
const reply = (content: string, extra: Record<string, unknown> = {}, finish = "stop") =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }], ...extra }), { status: 200 });
const bodyOf = (fn: ReturnType<typeof vi.fn>, i: number) => JSON.parse(fn.mock.calls[i][1].body as string);

describe("deepseekJson", () => {
  it("posts to chat/completions and maps usage", async () => {
    const f = vi.fn().mockResolvedValue(reply('{"ok":true}', { usage: { prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 20, completion_tokens: 5 } }));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(r.data).toEqual({ ok: true });
    expect(r.usage).toEqual({ cacheHit: 10, cacheMiss: 20, output: 5 });
    expect(f.mock.calls[0][0]).toBe("https://example.test/chat/completions");
    expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer sk-test");
    const b = bodyOf(f, 0);
    expect(b.thinking).toEqual({ type: "disabled" });
    expect(b.response_format).toEqual({ type: "json_object" });
    expect(b.max_tokens).toBe(100);
  });

  it("drops thinking after a 400 that mentions it", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("unknown field thinking", { status: 400 })).mockResolvedValueOnce(reply('{"ok":true}'));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(r.data.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect("thinking" in bodyOf(f, 1)).toBe(false);
  });

  it("throws on another 400 without retrying", async () => {
    const f = vi.fn().mockResolvedValue(new Response("bad image", { status: 400 }));
    const err = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect(err.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries once with more tokens on finish_reason length and sums usage", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("{", { usage: { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10, completion_tokens: 100 } }, "length"))
      .mockResolvedValueOnce(reply('{"ok":true}', { usage: { prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 0, completion_tokens: 20 } }));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(bodyOf(f, 1).max_tokens).toBe(200);
    expect(r.usage).toEqual({ cacheHit: 10, cacheMiss: 10, output: 120 });
  });

  it("caps the length retry at maxTokensCap", async () => {
    const f = vi.fn().mockResolvedValueOnce(reply("{", {}, "length")).mockResolvedValueOnce(reply('{"ok":true}'));
    await deepseekJson({ ...base, maxTokens: 200, maxTokensCap: 300, fetchImpl: f as unknown as typeof fetch });
    expect(bodyOf(f, 1).max_tokens).toBe(300);
  });

  it("retries once on invalid JSON, then fails with the summed usage", async () => {
    const ok = vi.fn().mockResolvedValueOnce(reply("nope")).mockResolvedValueOnce(reply('{"ok":true}'));
    await deepseekJson({ ...base, fetchImpl: ok as unknown as typeof fetch });
    expect(ok).toHaveBeenCalledTimes(2);

    const bad = vi.fn().mockImplementation(async () => reply("nope", { usage: { prompt_tokens: 7, completion_tokens: 3 } }));
    const err = await deepseekJson({ ...base, fetchImpl: bad as unknown as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect(bad).toHaveBeenCalledTimes(2);
    expect(err.usage).toEqual({ cacheHit: 0, cacheMiss: 14, output: 6 });
  });

  it("treats a schema failure as invalid", async () => {
    const f = vi.fn().mockResolvedValueOnce(reply('{"ok":false}')).mockResolvedValueOnce(reply('{"ok":true}'));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(r.attempts).toBe(2);
  });

  it("parses a fenced json block", async () => {
    const f = vi.fn().mockResolvedValue(reply('```json\n{"ok":true}\n```'));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(r.data.ok).toBe(true);
  });

  it("marks a network failure as an unknown outcome", async () => {
    const f = vi.fn().mockRejectedValue(new Error("boom"));
    const err = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect(err.unknownOutcome).toBe(true);
  });

  it("marks an unreadable 2xx body as an unknown outcome", async () => {
    const res = new Response("{}", { status: 200 });
    vi.spyOn(res, "json").mockRejectedValue(new Error("bad body"));
    const f = vi.fn().mockResolvedValue(res);
    const err = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect(err.unknownOutcome).toBe(true);
  });

  it("falls back to prompt_tokens as cache miss", async () => {
    const f = vi.fn().mockResolvedValue(reply('{"ok":true}', { usage: { prompt_tokens: 42, completion_tokens: 8 } }));
    const r = await deepseekJson({ ...base, fetchImpl: f as unknown as typeof fetch });
    expect(r.usage).toEqual({ cacheHit: 0, cacheMiss: 42, output: 8 });
  });
});

describe("deepseekConfig", () => {
  it("reads SPARK_DEEPSEEK_API and trims the base url", () => {
    const c = deepseekConfig({ SPARK_DEEPSEEK_API: "k", DEEPSEEK_BASE_URL: "https://x.test//" });
    expect(c).toMatchObject({ apiKey: "k", baseUrl: "https://x.test", model: "deepseek-flash" });
  });
});
