import { NextResponse } from "next/server";
import { aiError, apiContext } from "@/lib/api";
import { askAssistant, type ChatTurn } from "@/lib/assistant";

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
    const result = await askAssistant(ctx.supabase, ctx.me, history);
    await ctx.supabase.rpc("rms_log_event", {
      p_table: "ai_chat",
      p_row_id: ctx.me.id,
      p_data: { model: "claude-haiku-5-5", question: history.at(-1)!.content, records: result.records.map((r) => r.tracking_no) },
    });
    return NextResponse.json(result);
  } catch (err) {
    return aiError(err);
  }
}
