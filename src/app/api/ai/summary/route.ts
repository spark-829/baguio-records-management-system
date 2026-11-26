import { NextResponse } from "next/server";
import { aiModel, summaryRequest } from "@/lib/ai";
import { runAi } from "@/lib/ai-gate";
import { demoSummary, isAiDemo } from "@/lib/ai-demo";
import { aiError, apiContext } from "@/lib/api";
import { recordPeople, redactRecordForAi, redactText } from "@/lib/ai-redact";

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  const { recordId } = (await req.json()) as { recordId?: string };
  if (!recordId) return NextResponse.json({ error: "Missing record" }, { status: 400 });

  const { data: rec } = await supabase
    .from("rms_records")
    .select("tracking_no, confidentiality, direction, subject, description, sender_name, sender_org, recipient_name, recipient_org, status, due_date, content_text, current_office:rms_offices!rms_records_current_office_id_fkey(name)")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  // Confidential records never go to the outside AI service (QA-099).
  if (rec.confidentiality === "confidential")
    return NextResponse.json({ error: "Confidential records are kept out of AI features by office policy." }, { status: 403 });
  const { data: routes } = await supabase
    .from("rms_routes")
    .select("status, action_taken, remarks, created_at, to_office:rms_offices!rms_routes_to_office_id_fkey(code)")
    .eq("record_id", recordId)
    .order("created_at");

  try {
    let demo = isAiDemo();
    let note: string | undefined;
    let summary = "";
    if (!demo) {
      // Names, contact details and ID numbers are removed before anything leaves (QA-099).
      const people = recordPeople(rec);
      const out = await runAi(
        supabase,
        summaryRequest(
          redactRecordForAi({ ...rec, confidentiality: undefined }),
          (routes ?? []).map((r) => `${r.created_at} ${r.status} ${redactText(r.action_taken, people) ?? ""} ${redactText(r.remarks, people) ?? ""}`).join("\n"),
        ),
      );
      if (out.mode === "ai") summary = out.data.summary;
      else {
        demo = true;
        note = out.note;
      }
    }
    if (demo) summary = `Demo summary: ${demoSummary(rec, routes ?? [])}`;
    const { error } = await supabase.from("rms_records").update({ ai_summary: summary }).eq("id", recordId);
    // The person-access report shows that this record was summarized, and by whom (QA-100).
    await supabase.rpc("rms_log_access_many", { p_via: "ai_summary", p_record_ids: [recordId], p_detail: { demo } });
    await supabase.rpc("rms_log_event", { p_table: "ai_summary", p_row_id: recordId, p_data: { model: demo ? "demo" : aiModel(), summary, saved: !error } });
    return NextResponse.json({ summary, saved: !error, demo, note });
  } catch (err) {
    return aiError(err);
  }
}
