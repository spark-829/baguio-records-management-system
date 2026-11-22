import { NextResponse } from "next/server";
import { aiError, aiExcludesConfidential, apiContext } from "@/lib/api";
import { askAssistant, type ChatTurn } from "@/lib/assistant";
import { aiModel } from "@/lib/ai";
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
    const question = history.at(-1)!.content;
    const [{ data: offices }, { data: types }] = await Promise.all([
      ctx.supabase.from("rms_offices").select("code, name").eq("is_active", true),
      ctx.supabase.from("rms_document_types").select("name").eq("is_active", true),
    ]);
    let demo = isAiDemo();
    let note: string | undefined;
    let result: { answer: string; records: { id: string; tracking_no: string }[] };
    if (demo) {
      result = await demoChat(ctx.supabase, question, exclude, ctx.me.office?.code);
    } else {
      const out = await askAssistant(ctx.supabase, ctx.me, history, exclude, offices ?? [], (types ?? []).map((t) => t.name));
      if (out.mode === "ai") {
        result = out.data;
      } else {
        demo = true;
        note = out.note;
        result = await demoChat(ctx.supabase, question, exclude, ctx.me.office?.code);
      }
    }
    await ctx.supabase.rpc("rms_log_event", {
      p_table: "ai_chat",
      p_row_id: ctx.me.id,
      p_data: { model: demo ? "demo" : aiModel(), question, records: result.records.map((r) => r.tracking_no) },
    });
    return NextResponse.json({ ...result, demo, note });
  } catch (err) {
    return aiError(err);
  }
}
