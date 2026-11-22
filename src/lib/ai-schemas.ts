import { z } from "zod";

export const EXTRACT_MAX_CHARS = 600;

export interface IntakeResult {
  direction: "incoming" | "outgoing";
  subject: string;
  sender_name: string | null;
  sender_org: string | null;
  recipient_name: string | null;
  recipient_org: string | null;
  document_date: string | null;
  /** Empty string means "not matched to a known type" */
  document_type: string;
  category: string;
  keywords: string[];
  priority: "low" | "normal" | "urgent";
  confidentiality: "public" | "internal" | "confidential";
  /** Empty string means "not matched to a known office" */
  suggested_office_code: string;
  summary: string;
  extracted_text: string;
}

const nullableString = z.string().nullable().catch(null);

export function intakeModelSchema(docTypes: string[], officeCodes: string[]) {
  return z
    .object({
      direction: z.enum(["incoming", "outgoing"]).catch("incoming"),
      subject: z.string().min(1),
      sender_name: nullableString,
      sender_org: nullableString,
      recipient_name: nullableString,
      recipient_org: nullableString,
      document_date: z.string().nullable().catch(null),
      document_type: z.string().catch(""),
      category: z.string().catch(""),
      keywords: z.array(z.string()).catch([]),
      priority: z.enum(["low", "normal", "urgent"]).catch("normal"),
      confidentiality: z.enum(["public", "internal", "confidential"]).catch("internal"),
      suggested_office_code: z.string().catch(""),
      summary: z.string().catch(""),
      extracted_text: z.string().catch(""),
    })
    .transform((v): IntakeResult => {
      const type = docTypes.find((t) => t.toLowerCase() === v.document_type.trim().toLowerCase());
      const office = officeCodes.find((c) => c.toLowerCase() === v.suggested_office_code.trim().toLowerCase());
      const keywords = [...new Set(v.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
      return {
        ...v,
        subject: v.subject.slice(0, 120),
        document_date: v.document_date && /^\d{4}-\d{2}-\d{2}$/.test(v.document_date) ? v.document_date : null,
        document_type: type ?? "",
        suggested_office_code: office ?? "",
        keywords,
        extracted_text: v.extracted_text.slice(0, EXTRACT_MAX_CHARS),
      };
    });
}

export const searchModelSchema = z.object({
  q: z.string().nullable().catch(null),
  person: z.string().nullable().catch(null),
  direction: z.enum(["incoming", "outgoing"]).nullable().catch(null),
  status: z
    .enum(["registered", "forwarded", "received", "under_action", "completed", "released", "archived"])
    .nullable()
    .catch(null),
  office: z.string().nullable().catch(null),
  docType: z.string().nullable().catch(null),
  from: z.string().nullable().catch(null),
  to: z.string().nullable().catch(null),
  overdue: z.boolean().catch(false),
  explanation: z.string().catch(""),
});
export type SearchAi = z.infer<typeof searchModelSchema>;

export const summaryModelSchema = z.object({ summary: z.string().min(1).max(800) });
export const chatAnswerSchema = z.object({ answer: z.string().min(1).max(4000) });
