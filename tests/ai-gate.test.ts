import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const saved = { key: process.env.SPARK_DEEPSEEK_API, proxy: process.env.RMS_PROXY_KEY };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.SPARK_DEEPSEEK_API = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (saved.key === undefined) delete process.env.SPARK_DEEPSEEK_API;
  else process.env.SPARK_DEEPSEEK_API = saved.key;
  if (saved.proxy === undefined) delete process.env.RMS_PROXY_KEY;
  else process.env.RMS_PROXY_KEY = saved.proxy;
});

async function run(rpc: ReturnType<typeof vi.fn>) {
  const { runAi } = await import("../src/lib/ai-gate");
  const { searchRequest } = await import("../src/lib/ai");
  const client = { rpc } as never;
  return runAi(client, searchRequest("letters from last week", [], []));
}

describe("runAi", () => {
  it("shows the demo and skips the database while RMS_PROXY_KEY is unset", async () => {
    delete process.env.RMS_PROXY_KEY;
    const rpc = vi.fn();
    const out = await run(rpc);
    expect(out).toMatchObject({ mode: "demo", reason: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to the demo when the reservation fails", async () => {
    process.env.RMS_PROXY_KEY = "k".repeat(48);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } });
    const out = await run(rpc);
    expect(out).toMatchObject({ mode: "demo", reason: "error" });
    expect(rpc).toHaveBeenCalledWith("rms_ai_reserve", expect.anything());
  });

  it.each([
    ["rate_limited", "rate_limited"],
    ["budget", "budget"],
    ["other", "error"],
  ])("maps refusal %s to demo reason %s", async (reason, expected) => {
    process.env.RMS_PROXY_KEY = "k".repeat(48);
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, reason }, error: null });
    const out = await run(rpc);
    expect(out).toMatchObject({ mode: "demo", reason: expected });
  });
});
