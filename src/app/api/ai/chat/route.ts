import { NextResponse } from "next/server";
import { aiError, aiExcludesConfidential, apiContext } from "@/lib/api";
import { askAssistant, type ChatTurn } from "@/lib/assistant";
import { AI_MODEL } from "@/lib/ai";
import { demoChat, isAiDemo } from "@/lib/ai-demo";

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { messages } = (await req.json()) as { messages?: ChatTurn[] };
  const history = (messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (history.length === 0 || history.at(-1)!.role !== "user") {
    return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  }
  try {
    const exclude = await aiExcludesConfidential(ctx.supabase);
    const demo = isAiDemo();
    const result = demo
      ? await demoChat(ctx.supabase, history.at(-1)!.content, exclude, ctx.me.office?.code)
      : await askAssistant(ctx.supabase, ctx.me, history, exclude);
    await ctx.supabase.rpc("rms_log_event", {
      p_table: "ai_chat",
      p_row_id: ctx.me.id,
      p_data: { model: demo ? "demo" : AI_MODEL, question: history.at(-1)!.content, records: result.records.map((r) => r.tracking_no) },
    });
    return NextResponse.json({ ...result, demo });
  } catch (err) {
    return aiError(err);
  }
}
