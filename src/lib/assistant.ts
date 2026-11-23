import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatAnswerRequest } from "./ai";
import type { ChatSource } from "./chat-refs";
import { getSearchFilters, runAi, type AiOutcome } from "./ai-gate";
import { partyLabel } from "./labels";
import { searchRecords } from "./search";
import type { Profile } from "./types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantResult = { answer: string; records: { id: string; tracking_no: string }[] };

/**
 * Records assistant: AI turns the question into search filters, the search runs through the signed-in
 * user's Supabase client (so only records this user may see are used), then one AI call writes the answer.
 */
export async function askAssistant(
  supabase: SupabaseClient,
  me: Profile,
  history: ChatTurn[],
  excludeConfidential: boolean,
  offices: { code: string; name: string }[],
  docTypes: string[],
): Promise<AiOutcome<AssistantResult>> {
  const question = history.at(-1)!.content;
  const f = await getSearchFilters(supabase, question, offices, docTypes);
  if (f.mode === "demo") return f;

  const rows = await searchRecords(
    supabase,
    {
      q: f.data.q ?? undefined,
      person: f.data.person ?? undefined,
      direction: f.data.direction ?? undefined,
      status: f.data.status ?? undefined,
      office: f.data.office ?? undefined,
      docType: f.data.docType ?? undefined,
      from: f.data.from ?? undefined,
      to: f.data.to ?? undefined,
      overdue: f.data.overdue,
    },
    10,
    excludeConfidential,
  );
  const used = new Map<string, string>();
  rows.forEach((r) => used.set(r.id, r.tracking_no));

  const context: Record<string, unknown>[] = rows.slice(0, 10).map((r) => ({
    tracking_no: r.tracking_no,
    subject: r.subject,
    status: r.status,
    current_office: r.current_office,
    party: r.direction === "incoming" ? partyLabel(r.sender_name, r.sender_org) : partyLabel(r.recipient_name, r.recipient_org),
    due_date: r.due_date,
    summary: r.ai_summary?.slice(0, 200) ?? null,
  }));

  const asked = question.match(/\b(IN|OUT)-\d{4}-\d{4}\b/i);
  if (asked) {
    const { data: rec } = await supabase
      .from("rms_records")
      .select(
        "id, tracking_no, direction, subject, description, status, due_date, confidentiality, ai_summary, content_text, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)",
      )
      .eq("tracking_no", asked[0].toUpperCase())
      .is("deleted_at", null)
      .maybeSingle();
    if (rec && !(excludeConfidential && rec.confidentiality === "confidential")) {
      const { data: routes } = await supabase
        .from("rms_routes")
        .select("status, action_taken, remarks, created_at, to_office:rms_offices!rms_routes_to_office_id_fkey(code)")
        .eq("record_id", rec.id)
        .order("created_at");
      used.set(rec.id, rec.tracking_no);
      context.unshift({
        tracking_no: rec.tracking_no,
        subject: rec.subject,
        description: rec.description,
        status: rec.status,
        current_office: rec.current_office,
        due_date: rec.due_date,
        summary: rec.ai_summary?.slice(0, 200) ?? null,
        content_text: rec.content_text ? String(rec.content_text).slice(0, 1500) : null,
        history: routes,
      });
    }
  }

  const turns = history.slice(0, -1).filter((t) => t.content.trim());
  const out = await runAi(supabase, chatAnswerRequest(me, turns, question, JSON.stringify(context), excludeConfidential));
  if (out.mode === "demo") return out;
  return { mode: "ai", data: { answer: out.data.answer, records: [...used].map(([id, tracking_no]) => ({ id, tracking_no })) } };
}

/** Cards for the Sources panel. Re-read through the user's own client so RLS decides what is shown. */
export async function chatSources(supabase: SupabaseClient, cited: { id: string }[], excludeConfidential: boolean): Promise<ChatSource[]> {
  if (cited.length === 0) return [];
  const { data } = await supabase
    .from("rms_records")
    .select("id, tracking_no, subject, status, due_date, confidentiality, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .in("id", cited.slice(0, 10).map((c) => c.id))
    .is("deleted_at", null);
  const byId = new Map((data ?? []).map((r) => [r.id as string, r]));
  return cited.flatMap((c) => {
    const r = byId.get(c.id);
    if (!r || (excludeConfidential && r.confidentiality === "confidential")) return [];
    const o = Array.isArray(r.current_office) ? r.current_office[0] : r.current_office;
    return [{ id: r.id, tracking_no: r.tracking_no, subject: r.subject, status: r.status, due_date: r.due_date, office: o?.name ?? null }];
  }).map((s, i) => ({ ...s, n: i + 1 }));
}
