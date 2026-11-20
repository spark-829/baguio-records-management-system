import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** All AI features use Claude Haiku 5.5: fast and inexpensive for intake, search and chat. */
export const AI_MODEL = "claude-haiku-5-5";

export class AiUnavailableError extends Error {}

export function aiClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiUnavailableError("AI is not configured on this server (ANTHROPIC_API_KEY is missing).");
  return new Anthropic({ apiKey });
}

export function todayManila() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/* ------------------------------------------------------------------ */
/* Smart intake: read a scanned document and suggest the record fields */
/* ------------------------------------------------------------------ */

export function intakeSchema(docTypes: string[], officeCodes: string[]) {
  return z.object({
    direction: z.enum(["incoming", "outgoing"]),
    subject: z.string().describe("Short subject line, max 120 characters, in the document's language"),
    sender_name: z.string().nullable(),
    sender_org: z.string().nullable(),
    recipient_name: z.string().nullable(),
    recipient_org: z.string().nullable(),
    document_date: z.string().nullable().describe("Date written on the document, YYYY-MM-DD"),
    document_type: z.enum(docTypes as [string, ...string[]]),
    category: z.string().describe("One or two words, e.g. Infrastructure, Finance, Legal, Health"),
    keywords: z.array(z.string()).describe("3 to 8 lowercase search keywords"),
    priority: z.enum(["low", "normal", "urgent"]),
    confidentiality: z.enum(["public", "internal", "confidential"]),
    suggested_office_code: z.enum(officeCodes as [string, ...string[]]).describe("Office that should act on it"),
    summary: z.string().describe("One or two plain sentences: what it is and what is being asked"),
    extracted_text: z.string().describe("Full text of the document as read, plain text"),
  });
}

export type IntakeResult = z.infer<ReturnType<typeof intakeSchema>>;

export async function readDocument(opts: {
  base64: string;
  mimeType: string;
  docTypes: string[];
  offices: { code: string; name: string }[];
}): Promise<IntakeResult> {
  const client = aiClient();
  const schema = intakeSchema(opts.docTypes, opts.offices.map((o) => o.code));
  const fileBlock: Anthropic.ContentBlockParam =
    opts.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.base64 } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: opts.mimeType as "image/png" | "image/jpeg" | "image/webp",
            data: opts.base64,
          },
        };

  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    system:
      "You help the records desk of a Philippine city government register documents. " +
      "Read the attached document and fill in the registration fields. Use only what the document says; " +
      "use null when a field is not stated. Mark it confidential when it involves complaints, investigations, " +
      "medical, personnel or other personal information. Mark it urgent only when the document asks for urgent action " +
      "or sets a deadline within a week. Choose the office that should act on it from this list:\n" +
      opts.offices.map((o) => `${o.code}: ${o.name}`).join("\n"),
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: `Today is ${todayManila()}. Register this document.` }],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to read this document.");
  if (!response.parsed_output) throw new Error("The AI could not read this document. Please fill in the form manually.");
  return response.parsed_output;
}

/* ------------------------------------------------------------- */
/* Plain-language search: turn a sentence into search filters    */
/* ------------------------------------------------------------- */

export const searchSchema = z.object({
  q: z.string().nullable().describe("Keywords to match in subject, content and keywords"),
  person: z.string().nullable().describe("Name of a sender, recipient, or staff member"),
  direction: z.enum(["incoming", "outgoing"]).nullable(),
  status: z.enum(["registered", "forwarded", "received", "under_action", "completed", "released", "archived"]).nullable(),
  office: z.string().nullable().describe("Office code"),
  docType: z.string().nullable().describe("Document type name"),
  from: z.string().nullable().describe("YYYY-MM-DD"),
  to: z.string().nullable().describe("YYYY-MM-DD"),
  overdue: z.boolean(),
  explanation: z.string().describe("One short line describing the filters chosen"),
});

export async function toFilters(query: string, offices: { code: string; name: string }[], docTypes: string[]) {
  const client = aiClient();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(searchSchema) },
    system:
      `Turn a records search request into filters. Today is ${todayManila()} (Asia/Manila). ` +
      "Leave a filter null unless the request clearly asks for it. Keep q to the topic words only.\n" +
      `Offices: ${offices.map((o) => `${o.code}=${o.name}`).join("; ")}\nDocument types: ${docTypes.join(", ")}`,
    messages: [{ role: "user", content: query }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Could not understand that search.");
  return response.parsed_output;
}

/* ------------------------------ */
/* One-line summary for a record   */
/* ------------------------------ */

export async function summarize(record: Record<string, unknown>, history: string) {
  const client = aiClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low" },
    system:
      "Write a two-sentence summary of a government record for a dashboard: what it is, who it is from or for, " +
      "where it is now and what is pending. Plain English, no preamble.",
    messages: [{ role: "user", content: `Record:\n${JSON.stringify(record)}\n\nHistory:\n${history}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to summarize this record.");
  return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}
