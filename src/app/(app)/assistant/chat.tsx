"use client";

import { useT } from "@/lib/i18n/client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string; demo?: boolean; note?: string };

const EXAMPLES = [
  "What documents came from the Punong Barangay?",
  "Which records are overdue?",
  "Where is the drainage voucher now and what is missing?",
  "What did Engineering do about the Session Road request?",
  "Nasaan na po yung voucher para sa drainage?",
  "What is waiting in my office?",
];

/** Renders the assistant's text with [label](/records/...) links made clickable. Other markdown stays plain. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/records\/[0-9a-f-]{36}\))/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]\((\/records\/[0-9a-f-]{36})\)$/);
        return m ? (
          <Link key={i} href={m[2]} className="font-mono text-brand-700 underline">{m[1]}</Link>
        ) : (
          <span key={i}>{p.replace(/\*\*([^*\n]+)\*\*/g, "$1")}</span>
        );
      })}
    </p>
  );
}

export function Chat() {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only scroll once a conversation has started, so the page doesn't jump on first load.
    if (turns.length === 0) return;
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy]);

  async function send(question: string) {
    if (!question.trim() || busy) return;
    const next = [...turns, { role: "user" as const, content: question.trim() }];
    setTurns(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The assistant is unavailable");
      setTurns([...next, { role: "assistant", content: json.answer, demo: Boolean(json.demo), note: typeof json.note === "string" ? json.note : undefined }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant is unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-[70vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">{t("Try one of these:")}</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="min-h-11 rounded-full border-2 border-brand-200 bg-white px-4 py-1.5 text-left text-sm font-medium text-brand-900 hover:border-brand-700 hover:bg-brand-50">{e}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-base ${turn.role === "user" ? "bg-brand-700 text-white" : "border border-slate-200 bg-slate-50"}`}>
              {turn.role === "assistant" && turn.demo && (
                <span className="badge mb-1 bg-amber-100 text-amber-900">{t("Practice answer")}</span>
              )}
              {turn.role === "assistant" && turn.note && <p className="mb-1 text-xs text-amber-800">{t(turn.note)}</p>}
              {turn.role === "assistant" ? <Rich text={turn.content} /> : turn.content}
            </div>
          </div>
        ))}
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
        <label htmlFor="ask" className="sr-only">{t("Your question")}</label>
        <input id="ask" className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Type your question")} />
        <button className="btn-primary" disabled={busy}>{t("Send")}</button>
      </form>
    </div>
  );
}
