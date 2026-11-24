/** Register from an email file (.eml). Parsing runs in the browser only; postal-mime is loaded when a file is chosen. */
import { checkUpload } from "./upload-policy";
import { manilaDay } from "./arta";

export const MAX_EML_BYTES = 25 * 1024 * 1024;
export const MAX_EML_ATTACHMENTS = 5;

/** True when the first 8 KB looks like an email header block. */
export function looksLikeEml(head: string): boolean {
  const h = head.slice(0, 8192);
  return /^From:/im.test(h) && (/^Date:/im.test(h) || /^Subject:/im.test(h) || /^MIME-Version:/im.test(h));
}

type ParsedEmail = {
  subject?: string;
  from?: { name?: string; address?: string };
  date?: string;
  text?: string;
  html?: string;
  attachments?: { filename?: string | null; mimeType?: string; content: ArrayBuffer | Uint8Array | string }[];
};

export async function parseEml(buf: ArrayBuffer): Promise<ParsedEmail> {
  const { default: PostalMime } = await import("postal-mime");
  return (await PostalMime.parse(buf)) as unknown as ParsedEmail;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Text only. The HTML is never rendered. */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export type EmlFields = {
  subject: string;
  sender_name: string;
  sender_org: string;
  document_date: string;
  description: string;
  content_text: string;
  mode: "email";
};

export function emlToFields(email: ParsedEmail): EmlFields {
  const body = email.text?.trim() ? email.text : email.html ? stripHtml(email.html) : "";
  const addr = email.from?.address ?? "";
  const at = addr.lastIndexOf("@");
  const ms = email.date ? Date.parse(email.date) : NaN;
  return {
    subject: collapse(email.subject ?? "").slice(0, 300),
    sender_name: collapse(email.from?.name || addr).slice(0, 200),
    sender_org: at >= 0 ? addr.slice(at + 1).trim().toLowerCase().slice(0, 200) : "",
    document_date: Number.isNaN(ms) ? "" : manilaDay(new Date(ms)),
    description: collapse(body).slice(0, 4000),
    content_text: body.trim().slice(0, 200000),
    mode: "email",
  };
}

export type RawAttachment = { filename?: string | null; mimeType?: string; content: ArrayBuffer | Uint8Array | string };
const KEEP: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

function typeOf(a: RawAttachment): string | null {
  const m = (a.mimeType ?? "").toLowerCase().trim();
  if (m === "application/pdf" || m === "image/jpeg" || m === "image/png") return m;
  if (m && m !== "application/octet-stream") return null;
  const ext = (a.filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return KEEP[ext] ?? null;
}

export function pickAttachments(
  atts: RawAttachment[],
  maxTotal = 10 * 1024 * 1024,
): { kept: File[]; skipped: { name: string; reason: "type" | "size" }[] } {
  const kept: File[] = [];
  const skipped: { name: string; reason: "type" | "size" }[] = [];
  let total = 0;
  atts.forEach((a, i) => {
    const name = a.filename || `attachment-${i + 1}`;
    const type = typeOf(a);
    if (!type) return void skipped.push({ name, reason: "type" });
    const part = (typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content) as BlobPart;
    const file = new File([part], name, { type });
    if (checkUpload(type, file.size) || total + file.size > maxTotal || kept.length >= MAX_EML_ATTACHMENTS) {
      return void skipped.push({ name, reason: "size" });
    }
    total += file.size;
    kept.push(file);
  });
  return { kept, skipped };
}
