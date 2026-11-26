/**
 * Removes personal data before a record goes to the outside AI service (QA-099, Data Privacy Act).
 * Names of the sender and recipient become [sender] / [recipient] wherever they appear, and e-mail
 * addresses, phone numbers and ID-like numbers (TIN, SSS) become placeholders. Organizations, subjects,
 * offices and tracking numbers stay, so the summary still makes sense.
 */

const PARTICLES = new Set(["de", "del", "dela", "della", "delos", "los", "san", "sta", "sto", "jr", "sr", "ii", "iii", "the", "and", "mr", "mrs", "ms", "dr", "hon", "atty", "engr"]);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE = /(?:\+?63[\s-]?|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
const LANDLINE = /\(?\b0?74\)?[\s-]?\d{3}[\s-]?\d{4}\b/g;
const ID_NUMBER = /\b\d{2,4}(?:[\s-]\d{2,7}){2,3}\b/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function redactText(text: unknown, people: { name: string | null | undefined; label: string }[] = []): string | null {
  if (typeof text !== "string" || !text) return null;
  let out = text.replace(EMAIL, "[email]").replace(MOBILE, "[phone]").replace(LANDLINE, "[phone]");
  // Tracking numbers such as IN-2026-0037 have letters in front and are kept.
  out = out.replace(ID_NUMBER, (m, offset: number, all: string) => (/[A-Za-z]-$/.test(all.slice(Math.max(0, offset - 3), offset)) ? m : "[number]"));
  for (const p of people) {
    const full = (p.name ?? "").trim();
    if (full.length < 2) continue;
    out = out.replace(new RegExp(escape(full), "gi"), p.label);
    for (const w of full.split(/[\s,]+/)) {
      const word = w.replace(/\.$/, "");
      if (word.length < 3 || PARTICLES.has(word.toLowerCase())) continue;
      out = out.replace(new RegExp(`\\b${escape(word)}\\b`, "gi"), p.label);
    }
  }
  return out;
}

type Rec = { sender_name?: string | null; recipient_name?: string | null; [k: string]: unknown };

/** A copy of the record that is safe to send: personal names removed, free text redacted. */
export function redactRecordForAi<T extends Rec>(rec: T): T {
  const people = [
    { name: rec.sender_name, label: "[sender]" },
    { name: rec.recipient_name, label: "[recipient]" },
  ];
  const copy: Rec = { ...rec };
  if (rec.sender_name) copy.sender_name = "[sender]";
  if (rec.recipient_name) copy.recipient_name = "[recipient]";
  for (const k of ["description", "content_text", "subject", "ai_summary", "remarks", "action_taken"]) {
    if (typeof copy[k] === "string") copy[k] = redactText(copy[k], people);
  }
  for (const k of ["sender_contact", "sender_email", "sender_phone", "sender_address", "recipient_contact", "recipient_email", "recipient_phone", "recipient_address"]) {
    if (k in copy) copy[k] = copy[k] ? "[removed]" : copy[k];
  }
  return copy as T;
}

/** The people named on a record, for redacting its history notes the same way. */
export function recordPeople(rec: Rec) {
  return [
    { name: rec.sender_name, label: "[sender]" },
    { name: rec.recipient_name, label: "[recipient]" },
  ];
}
