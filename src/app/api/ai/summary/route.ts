import { NextResponse } from "next/server";
import { summarize } from "@/lib/ai";
import { aiError, apiContext } from "@/lib/api";

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  const { recordId } = (await req.json()) as { recordId?: string };
  if (!recordId) return NextResponse.json({ error: "Missing record" }, { status: 400 });

  const { data: rec } = await supabase
    .from("rms_records")
    .select("tracking_no, direction, subject, description, sender_name, sender_org, recipient_name, recipient_org, status, due_date, content_text, current_office:rms_offices!rms_records_current_office_id_fkey(name)")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const { data: routes } = await supabase
    .from("rms_routes")
    .select("status, action_taken, remarks, created_at, to_office:rms_offices!rms_routes_to_office_id_fkey(code)")
    .eq("record_id", recordId)
    .order("created_at");

  try {
    const summary = await summarize(
      { ...rec, content_text: rec.content_text ? String(rec.content_text).slice(0, 8000) : null },
      (routes ?? []).map((r) => `${r.created_at} ${r.status} ${r.action_taken ?? ""} ${r.remarks ?? ""}`).join("\n"),
    );
    const { error } = await supabase.from("rms_records").update({ ai_summary: summary }).eq("id", recordId);
    await supabase.rpc("rms_log_event", { p_table: "ai_summary", p_row_id: recordId, p_data: { model: "claude-haiku-5-5", summary, saved: !error } });
    return NextResponse.json({ summary, saved: !error });
  } catch (err) {
    return aiError(err);
  }
}
