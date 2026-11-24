import type { ChatSource } from "./chat-refs";

export const CHAT_KEY_PREFIX = "rms-chat:";
export function chatKey(userId: string) {
  return `${CHAT_KEY_PREFIX}${userId}`;
}

export type StoredTurn = { role: "user" | "assistant"; content: string; demo?: boolean; note?: string; sources?: ChatSource[] };

export const MAX_STORED_TURNS = 40;
export const MAX_STORED_CHARS = 60_000;
export const RECENT_TURNS = 4;
export const TURN_CHARS = 800;
export const QUESTION_CHARS = 4000;
export const SUMMARY_CHARS = 600;

/** Keep the chat small enough for sessionStorage: last turns only, bounded size, never starting with an answer. */
export function capStoredTurns(turns: StoredTurn[]): StoredTurn[] {
  let out = turns.slice(-MAX_STORED_TURNS);
  let total = out.reduce((n, t) => n + t.content.length, 0);
  while (out.length > 0 && total > MAX_STORED_CHARS) {
    total -= out[0].content.length;
    out = out.slice(1);
  }
  while (out.length > 0 && out[0].role === "assistant") out = out.slice(1);
  return out;
}

export function serializeChat(turns: StoredTurn[]): string {
  return JSON.stringify({ v: 1, turns: capStoredTurns(turns) });
}

function validSources(s: unknown): s is ChatSource[] {
  return (
    Array.isArray(s) &&
    s.every(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof x.id === "string" &&
        typeof x.tracking_no === "string" &&
        typeof x.n === "number" &&
        typeof x.subject === "string" &&
        typeof x.status === "string" &&
        (x.due_date === null || typeof x.due_date === "string") &&
        (x.office === null || typeof x.office === "string"),
    )
  );
}

export function parseStoredChat(raw: string | null): StoredTurn[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || data.v !== 1 || !Array.isArray(data.turns)) return [];
    const out: StoredTurn[] = [];
    for (const t of data.turns) {
      if (!t || typeof t !== "object") continue;
      if ((t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string") continue;
      const turn: StoredTurn = { role: t.role, content: t.content };
      if (typeof t.demo === "boolean") turn.demo = t.demo;
      if (typeof t.note === "string") turn.note = t.note;
      if (validSources(t.sources)) turn.sources = t.sources;
      out.push(turn);
    }
    return capStoredTurns(out);
  } catch {
    return [];
  }
}

/** Short deterministic digest of older turns (no AI call): recent questions and tracking numbers mentioned. */
export function summarizeEarlier(older: { role: string; content: string }[]): string {
  if (older.length === 0) return "";
  const questions = older
    .filter((t) => t.role === "user")
    .slice(-3)
    .map((t) => t.content.replace(/\s+/g, " ").trim().slice(0, 120));
  const seen = new Set<string>();
  for (let i = older.length - 1; i >= 0 && seen.size < 10; i--) {
    const found = older[i].content.match(/\b(IN|OUT)-\d{4}-\d{4}\b/gi) ?? [];
    for (const m of found.reverse()) {
      if (seen.size >= 10) break;
      seen.add(m.toUpperCase());
    }
  }
  const parts: string[] = [];
  if (questions.length > 0) parts.push(`Earlier questions: ${questions.join(" | ")}`);
  if (seen.size > 0) parts.push(`Records mentioned: ${[...seen].join(", ")}`);
  return parts.join("; ").slice(0, SUMMARY_CHARS);
}

/** Request body for /api/ai/chat: the new question, the last few turns, and a summary of anything older. */
export function buildChatRequest(turns: { role: "user" | "assistant"; content: string }[]): {
  messages: { role: "user" | "assistant"; content: string }[];
  summary: string;
} {
  const keep = RECENT_TURNS + 1;
  const recent = turns.slice(-keep);
  const older = turns.slice(0, Math.max(0, turns.length - keep));
  const messages = recent.map((t, i) => ({
    role: t.role,
    content: t.content.slice(0, i === recent.length - 1 ? QUESTION_CHARS : TURN_CHARS),
  }));
  return { messages, summary: summarizeEarlier(older) };
}

export function clearOtherChats(storage: Pick<Storage, "length" | "key" | "removeItem">, keepKey?: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(CHAT_KEY_PREFIX) && k !== keepKey) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
}
