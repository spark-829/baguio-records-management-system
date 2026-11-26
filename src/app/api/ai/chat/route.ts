import { NextResponse } from "next/server";
import { aiError, aiExcludesConfidential, apiContext } from "@/lib/api";
import { askAssistant, chatSources, type ChatTurn } from "@/lib/assistant";
import { aiModel } from "@/lib/ai";
import { citedRecords, stripRecordLinks } from "@/lib/chat-refs";
import { demoChat, isAiDemo } from "@/lib/ai-demo";

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as { messages?: ChatTurn[]; summary?: unknown };
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-5);
  const summary = typeof body.summary === "string" ? body.summary.slice(0, 2000).replace(/\s+/g, " ").trim().slice(0, 600) : "";
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
      const out = await askAssistant(ctx.supabase, ctx.me, history, exclude, offices ?? [], (types ?? []).map((t) => t.name), summary);
      if (out.mode === "ai") {
        result = out.data;
      } else {
        demo = true;
        note = out.note;
        result = await demoChat(ctx.supabase, question, exclude, ctx.me.office?.code);
      }
    }
    const answer = stripRecordLinks(result.answer);
    const sources = await chatSources(ctx.supabase, citedRecords(answer, result.records), exclude);
    await ctx.supabase.rpc("rms_log_event", {
      p_table: "ai_chat",
      p_row_id: ctx.me.id,
      p_data: { model: demo ? "demo" : aiModel(), question, records: result.records.map((r) => r.tracking_no), cited: sources.map((s) => s.tracking_no) },
    });
    // Each record the assistant read is written to the access log, so the person-access report shows it (QA-100).
    if (result.records.length)
      await ctx.supabase.rpc("rms_log_access_many", { p_via: "ai_chat", p_record_ids: result.records.map((r) => r.id), p_detail: { demo } });
    return NextResponse.json({ answer, sources, demo, note });
  } catch (err) {
    return aiError(err);
  }
}
