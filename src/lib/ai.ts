import "server-only";
import type { z } from "zod";
import { deepseekConfig, type ChatMessage } from "./deepseek";
import { chatAnswerSchema, intakeModelSchema, type IntakeResult, searchModelSchema, summaryModelSchema } from "./ai-schemas";

export class AiUnavailableError extends Error {}

export const aiModel = () => deepseekConfig().model;

export function todayManila() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export interface AiRequest<T> {
  feature: "intake" | "search" | "summary" | "chat";
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  maxTokens: number;
  maxTokensCap: number;
  timeoutMs: number;
}

/** [maxTokens, cap, timeoutMs] per feature */
export const AI_LIMITS = {
  intake: [900, 1400, 30000],
  search: [300, 600, 15000],
  summary: [200, 400, 15000],
  chat: [350, 700, 20000],
} as const;

const limits = (f: keyof typeof AI_LIMITS) => ({
  maxTokens: AI_LIMITS[f][0],
  maxTokensCap: AI_LIMITS[f][1],
  timeoutMs: AI_LIMITS[f][2],
});

/* Smart intake: read a scan of a document and suggest the record fields */
export function intakeRequest(dataUrl: string, docTypes: string[], offices: { code: string; name: string }[]): AiRequest<IntakeResult> {
  const system =
    "You help the records desk of a Philippine city government register documents. " +
    "Read the attached scan of a document and fill in the registration fields. Use only what the document says; " +
    "use null when a field is not stated. Mark it confidential when it involves complaints, investigations, " +
    "medical, personnel or other personal information. Mark it urgent only when the document asks for urgent action " +
    "or sets a deadline within a week. Choose the office that should act on it from the list below.\n" +
    "Reply with one json object only, with exactly these keys:\n" +
    '{"direction": "incoming" or "outgoing", "subject": short subject line, max 120 characters, ' +
    '"sender_name": string or null, "sender_org": string or null, "recipient_name": string or null, "recipient_org": string or null, ' +
    '"document_date": "YYYY-MM-DD" or null, "document_type": one of the listed types, "category": one or two words, ' +
    '"keywords": 3 to 8 lowercase words, "priority": "low" or "normal" or "urgent", ' +
    '"confidentiality": "public" or "internal" or "confidential", "suggested_office_code": one of the listed codes, ' +
    '"summary": one or two plain sentences, "extracted_text": the first 600 characters of the text}\n' +
    `Offices: ${offices.map((o) => `${o.code}=${o.name}`).join("; ")}\nDocument types: ${docTypes.join(", ")}`;
  return {
    feature: "intake",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: `Today is ${todayManila()}. Register this document.` },
        ],
      },
    ],
    schema: intakeModelSchema(docTypes, offices.map((o) => o.code)),
    ...limits("intake"),
  };
}

/* Plain-language search: turn a sentence into search filters */
export function searchRequest(query: string, offices: { code: string; name: string }[], docTypes: string[]): AiRequest<z.infer<typeof searchModelSchema>> {
  const system =
    "Turn a records search request into filters. Reply with one json object only, with exactly these keys: " +
    '{"q": topic words or null, "person": name of a sender, recipient or staff member or null, ' +
    '"direction": "incoming" or "outgoing" or null, ' +
    '"status": "registered" or "forwarded" or "received" or "under_action" or "completed" or "released" or "archived" or null, ' +
    '"office": office code or null, "docType": document type name or null, "from": "YYYY-MM-DD" or null, "to": "YYYY-MM-DD" or null, ' +
    '"overdue": true or false, "explanation": one short line describing the filters chosen}. ' +
    "Leave a filter null unless the request clearly asks for it. Keep q to the topic words only.\n" +
    `Offices: ${offices.map((o) => `${o.code}=${o.name}`).join("; ")}\nDocument types: ${docTypes.join(", ")}\n` +
    `Today is ${todayManila()} (Asia/Manila).`;
  return {
    feature: "search",
    messages: [
      { role: "system", content: system },
      { role: "user", content: query },
    ],
    schema: searchModelSchema,
    ...limits("search"),
  };
}

/* One short summary for a record */
export function summaryRequest(record: Record<string, unknown>, historyText: string): AiRequest<{ summary: string }> {
  const rec = { ...record, content_text: typeof record.content_text === "string" ? record.content_text.slice(0, 3000) : null };
  return {
    feature: "summary",
    messages: [
      {
        role: "system",
        content:
          "Write a two-sentence summary of a government record for a dashboard: what it is, who it is from or for, " +
          'where it is now and what is pending. Plain English, no preamble. Reply with one json object only: {"summary": string}',
      },
      { role: "user", content: `Record:\n${JSON.stringify(rec)}\n\nHistory:\n${historyText}` },
    ],
    schema: summaryModelSchema,
    ...limits("summary"),
  };
}

/* Chat answer, written only from the records JSON we pass in */
export function chatAnswerRequest(
  me: { full_name: string; role: string; office?: { name: string } | null },
  turns: { role: "user" | "assistant"; content: string }[],
  question: string,
  contextJson: string,
  excludeConfidential: boolean,
): AiRequest<{ answer: string }> {
  const system =
    `You are the records assistant of a city government Records Management System. Today is ${todayManila()} (Asia/Manila). ` +
    `The user is ${me.full_name}, ${me.role.replace("_", " ")}${me.office ? ` of ${me.office.name}` : ""}.\n` +
    "Answer only from the records JSON you are given; never guess a record, a name or a date. " +
    "If nothing is found, say so plainly; the user may not have access to some records. " +
    "Mention records by tracking number only, as plain text (for example IN-2026-0524): no links, no URLs, no ids, no markdown. " +
    "The app shows each cited record's subject, status, due date and office beside your answer, so do not repeat them unless they are the answer. " +
    (excludeConfidential ? "Confidential records are hidden from you by policy; if asked, say so and suggest the Records page. " : "") +
    'Answer in at most 3 short sentences, or up to 5 short bullet lines starting with "- ". Decide before you write; never correct yourself, think aloud or say "let me". Reply with one json object only: {"answer": string}';
  return {
    feature: "chat",
    messages: [
      { role: "system", content: system },
      ...turns.slice(-4).map((t) => ({ role: t.role, content: t.content.slice(0, 800) })),
      { role: "user", content: `Question: ${question}\n\nRecords you may use (json): ${contextJson}` },
    ],
    schema: chatAnswerSchema,
    ...limits("chat"),
  };
}
