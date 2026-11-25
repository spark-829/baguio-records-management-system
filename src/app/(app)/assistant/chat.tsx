"use client";

import { StatusBadge } from "@/components/badges";
import { splitCitations, type ChatSource } from "@/lib/chat-refs";
import { buildChatRequest, type StoredTurn } from "@/lib/chat-memory";
import { clearChat, readChat, useChatHistory, writeChat } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";
import { dueText } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Assistant text with every mentioned record shown as a tracking number plus a numbered chip linking to it. */
function Answer({ text, sources, onNavigate }: { text: string; sources: ChatSource[]; onNavigate?: () => void }) {
  const t = useT();
  return (
    <p className="min-w-0 whitespace-pre-wrap break-words text-base leading-relaxed">
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
    <div className="space-y-2">
      <ul aria-label={t("Sources")} className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <li key={s.id}>
            <Link href={`/records/${s.id}`} onClick={onNavigate} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm hover:border-brand-700 hover:bg-brand-50">
              <span aria-hidden="true" className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-700 px-1.5 text-xs font-bold text-white">{s.n}</span>
              <span className="font-mono font-semibold text-brand-800">{s.tracking_no}</span>
            </Link>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-800">{t("Source details ({n})", { n: sources.length })}</summary>
        <ol className="space-y-2">
          {sources.map((s) => {
            const late = isOverdue(s.due_date, s.status);
            const showDue = s.due_date && s.status !== "completed" && s.status !== "released" && s.status !== "archived";
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-700 px-1.5 text-xs font-bold text-white">{s.n}</span>
                  <span className="font-mono font-semibold text-brand-800">{s.tracking_no}</span>
                  <StatusBadge status={s.status} />
                  {showDue && <span className={late ? "font-medium text-red-700" : "text-slate-700"}>{dueText(s.due_date, undefined, t)}</span>}
                </div>
                <p className="mt-1 line-clamp-1 text-slate-900">{s.subject}</p>
                {s.office && <p className="mt-1 text-slate-600">{t("Now at")} {s.office}</p>}
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}

const ACTION = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50";

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
    </svg>
  );
}

type Props = {
  userId: string;
  compact?: boolean;
  inputId?: string;
  onNavigate?: () => void;
  /** Panel only: show the "Open full page" link in the toolbar. */
  fullPageLink?: boolean;
  greeting: string;
  /** English scope sentence (may contain {office}), translated here. */
  scope: string;
  office?: string;
  prompts: string[];
  demo?: boolean;
};

/** Users with a request still running in any Chat on this page (the panel and the full page can both be mounted). */
const inFlight = new Set<string>();

export function Chat({ userId, compact = false, inputId = "ask", onNavigate, fullPageLink = false, greeting, scope, office = "", prompts, demo = false }: Props) {
  const t = useT();
  const turns = useChatHistory(userId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ i: number; ok: boolean } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const lastQuestion = useRef<HTMLDivElement>(null);
  const retryBtn = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef(-1);
  const coarse = useRef(false);

  const lastUserIdx = turns.map((x) => x.role).lastIndexOf("user");
  const lastTurn = turns.at(-1);
  const unanswered = lastTurn?.role === "user" && !busy && !error && !inFlight.has(userId);

  useEffect(() => {
    coarse.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  // Bring the newest question to the top of the reading area; never jump to the end of a long answer.
  useEffect(() => {
    if (lastUserIdx < 0 || lastUserIdx === scrolledFor.current) return;
    const restoring = scrolledFor.current === -1 && !busy;
    scrolledFor.current = lastUserIdx;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastQuestion.current?.scrollIntoView({ behavior: restoring || reduce ? "auto" : "smooth", block: "start" });
  }, [lastUserIdx, busy]);

  useEffect(() => {
    if (turns.length === 0) scrolledFor.current = -1;
  }, [turns.length]);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    if (error) {
      // Only take focus when the person is in this chat (or nowhere): the docked panel sits beside work in progress.
      const a = document.activeElement;
      if (!a || a === document.body || root.current?.contains(a)) retryBtn.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  // Shrink the box back after a send.
  useLayoutEffect(() => {
    if (text === "" && area.current) area.current.style.height = "auto";
  }, [text]);

  function newChat() {
    clearChat(userId);
    setError(null);
    document.getElementById(inputId)?.focus();
  }

  async function send(question: string, retry = false) {
    if (!question.trim() || busy || inFlight.has(userId)) return;
    let base = turns;
    if (retry) {
      if (base.at(-1)?.role === "assistant") base = base.slice(0, -1);
      if (base.at(-1)?.role === "user") base = base.slice(0, -1);
    }
    const userTurn: StoredTurn = { role: "user", content: question.trim() };
    const next = [...base, userTurn];
    writeChat(userId, next);
    setText("");
    setBusy(true);
    setError(null);
    document.getElementById(inputId)?.focus();
    inFlight.add(userId);
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
      inFlight.delete(userId);
      setBusy(false);
    }
  }

  function retry() {
    const q = turns[lastUserIdx]?.content;
    if (q) send(q, true);
  }

  async function copy(i: number) {
    const turn = turns[i];
    const lines = (turn.sources ?? []).map((s) => `${s.n}. ${s.tracking_no} ${s.subject}`);
    const body = lines.length ? `${turn.content}\n\n${t("Sources")}:\n${lines.join("\n")}` : turn.content;
    try {
      await navigator.clipboard.writeText(body);
      setCopied({ i, ok: true });
    } catch {
      setCopied({ i, ok: false });
    }
  }

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  const showToolbar = fullPageLink || turns.length > 0;
  const toolbar = showToolbar && (
    <div className={compact ? "flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2" : "flex items-center justify-end gap-2 pb-2"}>
      {fullPageLink && (
        <Link prefetch={false} href="/assistant" onClick={onNavigate} className="inline-flex min-h-11 items-center rounded-lg px-2 text-base font-semibold text-brand-800 underline underline-offset-4 hover:bg-brand-50">
          {t("Open full page")}
        </Link>
      )}
      {turns.length > 0 && (
        <button type="button" onClick={newChat} disabled={busy} className="btn-secondary ml-auto">{t("New chat")}</button>
      )}
    </div>
  );

  const failBox = (message: string, alert: boolean) => (
    <div role={alert ? "alert" : undefined} className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">
      <p className="font-semibold">{t("The assistant could not answer.")}</p>
      <p>{t(message)}</p>
      <button ref={retryBtn} type="button" onClick={retry} className="btn-secondary">{t("Try again")}</button>
    </div>
  );

  const list = (
    <div role="log" aria-live="polite" aria-relevant="additions" className={compact ? "min-h-0 flex-1 space-y-5 overflow-y-auto p-4" : "space-y-5 py-2"}>
      {turns.length === 0 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-lg font-bold text-slate-900">{t("Good day, {name}.", { name: greeting })}</p>
            <p className="text-base text-slate-800">{t(scope, { office })} {t("Ask in plain words, in English or Taglish.")}</p>
          </div>
          {demo && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>{t("Practice version:")}</strong> {t("Practice answers are simpler than the full assistant, but they come from the real records you may see.")}
            </p>
          )}
          <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
            {prompts.map((e) => (
              <button key={e} type="button" onClick={() => send(e)} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white p-3 text-left text-base hover:border-brand-700 hover:bg-brand-50">{t(e)}</button>
            ))}
          </div>
        </div>
      )}
      {turns.map((turn, i) =>
        turn.role === "user" ? (
          <div key={i} ref={i === lastUserIdx ? lastQuestion : undefined} className="flex scroll-mt-2 justify-end">
            <div className="max-w-[85%] break-words rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-slate-900">
              <span className="sr-only">{t("You:")} </span>{turn.content}
            </div>
          </div>
        ) : (
          <div key={i} className="min-w-0 space-y-2">
            <span className="sr-only">{t("Assistant:")}</span>
            {turn.demo && <span className="badge bg-amber-100 text-amber-900">{t("Practice answer")}</span>}
            {turn.note && <p className="text-xs text-amber-800">{t(turn.note)}</p>}
            <Answer text={turn.content} sources={turn.sources ?? []} onNavigate={onNavigate} />
            <Sources sources={turn.sources ?? []} onNavigate={onNavigate} />
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => copy(i)} className={ACTION}><CopyIcon />{t("Copy")}</button>
              {i === turns.length - 1 && !busy && (
                <button type="button" onClick={retry} className={ACTION}><RetryIcon />{t("Try again")}</button>
              )}
              {copied?.i === i && <span role="status" className="text-sm text-slate-700">{copied.ok ? t("Copied") : t("Could not copy")}</span>}
            </div>
          </div>
        ),
      )}
      {busy && (
        <div role="status" className="space-y-1 text-base text-slate-700">
          <p><span className="sr-only">{t("Assistant:")} </span>{t("Searching the records you may see…")}</p>
          {slow && <p>{t("Still working. This can take up to 20 seconds.")}</p>}
        </div>
      )}
      {error && failBox(error, true)}
      {unanswered && failBox("No answer was saved for this question.", false)}
    </div>
  );

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(text);
      }}
      className={compact ? "shrink-0 border-t border-slate-200 bg-white p-3" : "sticky bottom-0 border-t border-slate-200 bg-page pt-2 pb-3"}
    >
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">{t("Your question")}</label>
        <textarea
          id={inputId}
          ref={area}
          rows={1}
          className="input max-h-48 flex-1 resize-none overflow-y-auto"
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={(e) => grow(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || coarse.current) return;
            e.preventDefault();
            send(text);
          }}
          placeholder={t("Type your question")}
        />
        <button type="submit" className="btn-primary self-end" disabled={busy}>{busy ? t("Sending…") : t("Send")}</button>
      </div>
      <p className="mt-2 text-xs text-slate-600">{t("Searches only records your account may see. Check the record before you act. Do not type personal details you do not need. Cleared when you sign out.")}</p>
    </form>
  );

  return (
    <div ref={root} className={compact ? "flex h-full min-h-0 flex-col" : "flex flex-col"}>
      {toolbar}
      {list}
      {composer}
    </div>
  );
}
