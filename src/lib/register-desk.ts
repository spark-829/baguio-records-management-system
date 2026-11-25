// Pure helpers for the records desk Register form (drop zone routing, filing summary, error summary).
import { ATTACHMENT_TYPES, MAX_UPLOAD_BYTES } from "./upload-policy";
import { MAX_EML_BYTES } from "./eml";
import { ARTA_LABEL, isArtaClass } from "./arta";
import type { T } from "./i18n/core";

export type FileRoute = { kind: "attachment" } | { kind: "eml" } | { kind: "error"; message: string };

/** Where a dropped or picked file goes: the attachment, the email reader, or an error in plain words. */
export function routeFile(f: { name: string; type: string; size: number }): FileRoute {
  if (!(f.size > 0)) return { kind: "error", message: "This file is empty. Choose another file." };
  if (/\.eml$/i.test(f.name) || f.type === "message/rfc822") {
    if (f.size > MAX_EML_BYTES) return { kind: "error", message: "This email file is larger than 25 MB." };
    return { kind: "eml" };
  }
  if (f.type === "application/pdf") {
    if (f.size > MAX_UPLOAD_BYTES) {
      return { kind: "error", message: "This file is larger than 10 MB. Please upload a smaller file or a scan at a lower resolution." };
    }
    return { kind: "attachment" };
  }
  // Images are compressed before upload, so any size is accepted here.
  // Allowed image types at any size: the browser compresses them before upload.
  if (f.type.startsWith("image/") && ATTACHMENT_TYPES.includes(f.type)) return { kind: "attachment" };
  return { kind: "error", message: "Use a PDF, JPG or PNG file, or an email saved as .eml." };
}

/** One line under "Filing details" so the closed section still says what will be saved. */
export function filingSummary(
  v: { direction: "incoming" | "outgoing"; priority: string; confidentiality: string; mode: string; arta_class: string; in_reply_to?: string },
  t: T,
): string {
  const parts: string[] = [];
  parts.push(v.priority === "urgent" ? t("Urgent priority") : v.priority === "low" ? t("Low priority") : t("Normal priority"));
  if (v.confidentiality === "public") parts.push(t("Public"));
  else if (v.confidentiality === "confidential") parts.push(t("Confidential"));
  else if (v.confidentiality === "internal") parts.push(t("Internal"));
  if (v.mode === "walk-in") parts.push(t("Hand-carried"));
  else if (v.mode === "courier") parts.push(t("Courier"));
  else if (v.mode === "mail") parts.push(t("Mail"));
  else if (v.mode === "email") parts.push(t("Email"));
  else if (v.mode === "internal") parts.push(v.direction === "incoming" ? t("From another City office") : t("To another City office"));
  parts.push(isArtaClass(v.arta_class) && v.arta_class !== "none" ? t(ARTA_LABEL[v.arta_class]) : t("No ARTA time"));
  const tn = v.in_reply_to?.trim();
  if (v.direction === "outgoing" && tn) parts.push(t("In reply to {tn}", { tn }));
  return parts.join(" · ");
}

/** The form field a server error message is about, so the summary can link to it. */
export function serverErrorField(msg: string): string | null {
  if (/^Subject/.test(msg)) return "f-subject";
  if (/document type/i.test(msg)) return "f-document_type_id";
  if (/transaction type/i.test(msg)) return "f-tx-G2C";
  if (/reference number/i.test(msg)) return "f-reference_no";
  if (/tracking number of the received letter|No received record/.test(msg)) return "f-in_reply_to";
  if (/barangay/i.test(msg)) return "f-barangay";
  if (/^No record with that tracking number/.test(msg)) return "f-copy_source";
  if (/service/i.test(msg)) return "f-service";
  if (/10 MB|PDF, PNG|^Choose a file$/.test(msg)) return "file-pick";
  return null;
}

export type ErrorItem = { id: string | null; text: string; server: boolean };

/** Items for the error summary: browser-blocked fields first, then the server message. */
export function errorItems(missing: { id: string; label: string }[], server?: string): ErrorItem[] {
  const items: ErrorItem[] = missing.map((m) => ({ id: m.id || null, text: m.label, server: false }));
  if (server) items.push({ id: serverErrorField(server), text: server, server: true });
  return items;
}
