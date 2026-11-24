"use client";

import { StatusBadge } from "@/components/badges";
import { splitCitations, type ChatSource } from "@/lib/chat-refs";
import { buildChatRequest, type StoredTurn } from "@/lib/chat-memory";
import { clearChat, readChat, useChatHistory, writeChat } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";
import { dueText } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "What documents came from the Punong Barangay?",
  "Which records are overdue?",
  "Where is the drainage voucher now and what is missing?",
  "What did Engineering do about the Session Road request?",
  "Nasaan na po yung voucher para sa drainage?",
  "What is waiting in my office?",
];

/** Assistant text with every mentioned record shown as a tracking number plus a numbered chip linking to it. */
function Answer({ text, sources, onNavigate }: { text: string; sources: ChatSource[]; onNavigate?: () => void }) {
  const t = useT();
  return (
    <p className="whitespace-pre-wrap">
      {splitCitations(text, sources).map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text}</span>
        ) : (
          <Link key={i} href={`/records/${p.id}`} onClick={onNavigate} aria-label={t("Source {n}: {tn}", { n: p.ref, tn: p.tracking_no })}
            className="rounded font-mono font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-900">
            {p.tracking_no}<span aria-hidden="true" className="ml-1 inline-flex h-6 min-w-6 -translate-y-1 items-center justify-center rounded-full bg-brand-100 px-1.5 font-sans text-xs font-bold text-brand-800 no-underline">{p.ref}</span>
          </Link>
        ),
      )}
    </p>
  );
}

function Sources({ sources, onNavigate }: { sources: ChatSource[]; onNavigate?: () => void }) {
  const t = useT();
  if (sources.length === 0) return null;
  return (
    <aside aria-label={t("Sources")} className="rounded-2xl border border-slate-200 bg-white p-3">
      <h3 className="text-base font-semibold text-slate-700">{t("Sources")}</h3>
      <ol className="mt-2 space-y-2">
        {sources.map((s) => {
          const late = isOverdue(s.due_date, s.status);
          const showDue = s.due_date && s.status !== "completed" && s.status !== "released" && s.status !== "archived";
          return (
            <li key={s.id}>
              <Link href={`/records/${s.id}`} onClick={onNavigate} className="block min-h-11 rounded-xl border border-slate-200 p-3 hover:border-brand-700 hover:bg-brand-50">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-700 px-2 text-sm font-bold text-white">{s.n}</span>
                  <span className="font-mono font-semibold text-brand-800">{s.tracking_no}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-base text-slate-900">{s.subject}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={s.status} />
                  {showDue && <span className={late ? "font-medium text-red-700" : "text-slate-700"}>{dueText(s.due_date, undefined, t)}</span>}
                </div>
                {s.office && <p className="mt-1 text-sm text-slate-600">{t("Now at")} {s.office}</p>}
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function Chat({ userId, compact = false, inputId = "ask", onNavigate }: { userId: string; compact?: boolean; inputId?: string; onNavigate?: () => void }) {
  const t = useT();
  const turns = useChatHistory(userId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Only scroll once a conversation has started, so the page doesn't jump on first load.
    if (turns.length === 0) return;
    // A restored chat jumps to the end instead of animating.
    end.current?.scrollIntoView({ behavior: first.current ? "auto" : "smooth", block: "nearest" });
    first.current = false;
  }, [turns, busy]);

  function newChat() {
    clearChat(userId);
    setError(null);
    document.getElementById(inputId)?.focus();
  }

  async function send(question: string) {
    if (!question.trim() || busy) return;
    const userTurn: StoredTurn = { role: "user", content: question.trim() };
    const next = [...turns, userTurn];
    writeChat(userId, next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildChatRequest(next.map(({ role, content }) => ({ role, content })))),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The assistant is unavailable");
      // The user may have pressed New chat or signed out while waiting.
      const now = readChat(userId);
      if (now.at(-1) !== userTurn) return;
      const assistantTurn: StoredTurn = { role: "assistant", content: json.answer, demo: Boolean(json.demo), note: typeof json.note === "string" ? json.note : undefined, sources: Array.isArray(json.sources) ? json.sources : [] };
      writeChat(userId, [...now, assistantTurn]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant is unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex h-full min-h-0 flex-col" : "card flex h-[70vh] flex-col"}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">{t("Try one of these:")}</p>
            <div className="flex flex-wrap gap-2">
              {(compact ? EXAMPLES.slice(0, 3) : EXAMPLES).map((e) => (
                <button key={e} onClick={() => send(e)} className="min-h-11 rounded-full border-2 border-brand-200 bg-white px-4 py-1.5 text-left text-sm font-medium text-brand-900 hover:border-brand-700 hover:bg-brand-50">{e}</button>
              ))}
            </div>
          </div>
        )}
        {turns.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{t("Kept until you sign out or close this tab.")}</p>
            <button type="button" onClick={newChat} disabled={busy} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand-800 underline underline-offset-4 hover:bg-brand-50">{t("New chat")}</button>
          </div>
        )}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-brand-700 px-4 py-3 text-lg text-white">{turn.content}</div>
            </div>
          ) : (
            <div key={i} className={compact ? "grid gap-3" : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg leading-relaxed">
                {turn.demo && <span className="badge mb-1 bg-amber-100 text-amber-900">{t("Practice answer")}</span>}
                {turn.note && <p className="mb-1 text-xs text-amber-800">{t(turn.note)}</p>}
                <Answer text={turn.content} sources={turn.sources ?? []} onNavigate={onNavigate} />
              </div>
              {turn.sources && turn.sources.length > 0 && <Sources sources={turn.sources} onNavigate={onNavigate} />}
            </div>
          ),
        )}
        {busy && <p className="text-sm text-slate-500">{t("Searching records…")}</p>}
        {error && <p role="alert" className="text-sm font-medium text-red-700">{t(error)}</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <label htmlFor={inputId} className="sr-only">{t("Your question")}</label>
        <input id={inputId} className="input flex-1" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Type your question")} />
        <button className="btn-primary" disabled={busy}>{t("Send")}</button>
      </form>
    </div>
  );
}
