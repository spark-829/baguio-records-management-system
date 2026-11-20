"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string; demo?: boolean };

const EXAMPLES = [
  "What documents came from the Punong Barangay?",
  "Which records are overdue?",
  "Where is the drainage voucher now and what is missing?",
  "What did Engineering do about the Session Road request?",
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
          <span key={i}>{p.replace(/\*\*/g, "")}</span>
        );
      })}
    </p>
  );
}

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
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
      setTurns([...next, { role: "assistant", content: json.answer, demo: Boolean(json.demo) }]);
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
            <p className="text-sm text-slate-600">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">{e}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${t.role === "user" ? "bg-brand-700 text-white" : "bg-slate-100"}`}>
              {t.role === "assistant" && t.demo && (
                <span className="badge mb-1 bg-amber-100 text-amber-900">Demo mode: sample AI output</span>
              )}
              {t.role === "assistant" ? <Rich text={t.content} /> : t.content}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-500">Searching records…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about any record, person or office…" />
        <button className="btn-primary" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
