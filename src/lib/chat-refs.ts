import type { Status } from "./types";

export type ChatSource = {
  n: number;
  id: string;
  tracking_no: string;
  subject: string;
  status: Status;
  due_date: string | null;
  office: string | null;
};

export type CitationPart = { text: string } | { ref: number; tracking_no: string; id: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes record links and bold markers the model may still produce; keeps the tracking number text. */
export function stripRecordLinks(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\(\s*<?\s*\/records\/[^)\s>]*\s*>?\s*\)/g, "$1")
    .replace(/\[\s*\**\s*((?:IN|OUT)-\d{4}-\d{4,})\s*\**\s*\]\(\s*<?[^)>\s]*>?\s*\)/gi, "$1")
    .replace(/\s*(?:\(\s*<?\/records\/[0-9a-f-]{36}>?\s*\)|<?\/records\/[0-9a-f-]{36}>?)/gi, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .trim();
}

/** Records mentioned in the answer, in order of first mention, numbered from 1. */
export function citedRecords<R extends { id: string; tracking_no: string }>(answer: string, records: R[]): (R & { n: number })[] {
  const found = new Map<string, { r: R; index: number }>();
  for (const r of records) {
    const m = new RegExp(`(?<![A-Za-z0-9])${esc(r.tracking_no)}(?![A-Za-z0-9])`, "i").exec(answer);
    if (!m) continue;
    const key = r.tracking_no.toUpperCase();
    if (!found.has(key)) found.set(key, { r, index: m.index });
  }
  return [...found.values()].sort((a, b) => a.index - b.index).map(({ r }, i) => ({ ...r, n: i + 1 }));
}

/** Splits the answer into text and citation parts; every mention of a numbered record becomes a ref. */
export function splitCitations(answer: string, numbered: { n: number; id: string; tracking_no: string }[]): CitationPart[] {
  if (numbered.length === 0) return answer ? [{ text: answer }] : [];
  const byNo = new Map(numbered.map((s) => [s.tracking_no.toUpperCase(), s]));
  const alt = [...byNo.keys()].sort((a, b) => b.length - a.length).map(esc).join("|");
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, "gi");
  const parts: CitationPart[] = [];
  let last = 0;
  for (const m of answer.matchAll(re)) {
    const s = byNo.get(m[0].toUpperCase());
    if (!s) continue;
    if (m.index > last) parts.push({ text: answer.slice(last, m.index) });
    parts.push({ ref: s.n, tracking_no: s.tracking_no, id: s.id });
    last = m.index + m[0].length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last) });
  return parts;
}
