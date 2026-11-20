import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AI_MODEL, aiClient, todayManila } from "./ai";
import { searchRecords } from "./search";
import type { Profile } from "./types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Records assistant. Every tool call runs through the signed-in user's Supabase client,
 * so the assistant can only see records that this user is allowed to see.
 */
export async function askAssistant(supabase: SupabaseClient, me: Profile, history: ChatTurn[]) {
  const usedRecords = new Map<string, string>();

  const searchTool = betaZodTool({
    name: "search_records",
    description:
      "Search the records the current user may see. Combine filters as needed. Use `person` for names of senders, " +
      "recipients or staff who registered or acted on a record. Returns at most 20 records, newest and best matches first.",
    inputSchema: z.object({
      q: z.string().optional().describe("Topic keywords or a tracking number"),
      person: z.string().optional(),
      direction: z.enum(["incoming", "outgoing"]).optional(),
      status: z.enum(["registered", "forwarded", "received", "under_action", "completed", "released", "archived"]).optional(),
      office: z.string().optional().describe("Office code such as CMO, CEO, CTO"),
      docType: z.string().optional(),
      from: z.string().optional().describe("YYYY-MM-DD"),
      to: z.string().optional().describe("YYYY-MM-DD"),
      overdue: z.boolean().optional(),
    }),
    run: async (input) => {
      const rows = await searchRecords(supabase, input, 20);
      rows.forEach((r) => usedRecords.set(r.id, r.tracking_no));
      if (rows.length === 0) return "No records found (or none this user is allowed to see).";
      return JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          tracking_no: r.tracking_no,
          link: `/records/${r.id}`,
          subject: r.subject,
          direction: r.direction,
          type: r.document_type,
          status: r.status,
          current_office: r.current_office,
          from: r.sender || null,
          to: r.recipient || null,
          registered_by: r.created_by_name,
          registered_at: r.created_at,
          due_date: r.due_date,
          summary: r.ai_summary,
        })),
      );
    },
  });

  const getTool = betaZodTool({
    name: "get_record",
    description: "Get one record's full details, its routing history with actions and remarks, and its attachments.",
    inputSchema: z.object({ tracking_no: z.string().describe("e.g. IN-2026-0001") }),
    run: async ({ tracking_no }) => {
      const { data: rec } = await supabase
        .from("rms_records")
        .select(
          "id, tracking_no, direction, subject, description, category, keywords, priority, confidentiality, sender_name, sender_org, recipient_name, recipient_org, document_date, status, due_date, created_at, ai_summary, content_text, doc_type:rms_document_types(name), current_office:rms_offices!rms_records_current_office_id_fkey(code, name)",
        )
        .eq("tracking_no", tracking_no.trim().toUpperCase())
        .maybeSingle();
      if (!rec) return "Not found, or this user is not allowed to see it.";
      usedRecords.set(rec.id, rec.tracking_no);
      const [{ data: routes }, { data: files }] = await Promise.all([
        supabase
          .from("rms_routes")
          .select("status, action_taken, remarks, created_at, from_office:rms_offices!rms_routes_from_office_id_fkey(code), to_office:rms_offices!rms_routes_to_office_id_fkey(code), actor:rms_profiles(full_name)")
          .eq("record_id", rec.id)
          .order("created_at"),
        supabase.from("rms_attachments").select("file_name, uploaded_at").eq("record_id", rec.id),
      ]);
      return JSON.stringify({
        ...rec,
        content_text: rec.content_text ? String(rec.content_text).slice(0, 6000) : null,
        link: `/records/${rec.id}`,
        history: routes,
        attachments: files,
      });
    },
  });

  const client = aiClient();
  const messages: Anthropic.MessageParam[] = history.slice(-12).map((t) => ({ role: t.role, content: t.content }));

  const final = await client.beta.messages.toolRunner({
    model: AI_MODEL,
    max_tokens: 4000,
    max_iterations: 6,
    output_config: { effort: "low" },
    system:
      `You are the records assistant of a city government Records Management System. Today is ${todayManila()} (Asia/Manila). ` +
      `The user is ${me.full_name}, ${me.role.replace("_", " ")}${me.office ? ` of ${me.office.name}` : ""}.\n` +
      "Answer only from what the tools return; never guess a record, a name or a date. " +
      "If nothing is found, say so plainly; the user may not have access to some records. " +
      "Whenever you mention a record, link it as a markdown link with its tracking number as the text and its `link` as the URL, " +
      "for example [IN-2026-0001](/records/<id>). Keep answers short: a sentence or two, then a list of records if useful.",
    tools: [searchTool, getTool],
    messages,
  });

  if (final.stop_reason === "refusal") {
    return { answer: "I can't help with that request.", records: [] as { id: string; tracking_no: string }[] };
  }
  const answer = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return {
    answer: answer || "I couldn't find an answer. Try naming a person, an office or a topic.",
    records: [...usedRecords].map(([id, tracking_no]) => ({ id, tracking_no })),
  };
}
