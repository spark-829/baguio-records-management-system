"use client";

import { useActionState, useRef, useState } from "react";
import { registerRecord } from "./actions";

type Opt = { id: string; name: string };
type OfficeOpt = Opt & { code: string };

type Fields = {
  direction: "incoming" | "outgoing";
  subject: string;
  description: string;
  document_type_id: string;
  category: string;
  keywords: string;
  priority: "low" | "normal" | "urgent";
  confidentiality: "public" | "internal" | "confidential";
  sender_name: string;
  sender_org: string;
  recipient_name: string;
  recipient_org: string;
  mode: string;
  document_date: string;
  due_date: string;
  forward_to: string;
  content_text: string;
  ai_summary: string;
};

export function RegisterForm(props: { types: Opt[]; offices: OfficeOpt[]; canIncoming: boolean; myOfficeId: string | null }) {
  const [state, action, pending] = useActionState(registerRecord, undefined);
  const [f, setF] = useState<Fields>({
    direction: props.canIncoming ? "incoming" : "outgoing",
    subject: "",
    description: "",
    document_type_id: "",
    category: "",
    keywords: "",
    priority: "normal",
    confidentiality: "internal",
    sender_name: "",
    sender_org: "",
    recipient_name: "",
    recipient_org: "",
    mode: props.canIncoming ? "walk-in" : "courier",
    document_date: "",
    due_date: "",
    forward_to: "",
    content_text: "",
    ai_summary: "",
  });
  const [aiState, setAiState] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [aiMsg, setAiMsg] = useState("");
  const [aiFilled, setAiFilled] = useState<Set<keyof Fields>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setAiFilled((s) => {
      if (!s.has(k)) return s;
      const n = new Set(s);
      n.delete(k);
      return n;
    });
  };

  const [noAi, setNoAi] = useState(false);

  async function readWithAi() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setAiState("error");
      setAiMsg("Choose a scanned PDF or photo first.");
      return;
    }
    setAiState("reading");
    setAiMsg("Reading the document…");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ai/intake", { method: "POST", body });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? "Could not read the document");
      const type = props.types.find((t) => t.name === r.document_type);
      const office = props.offices.find((o) => o.code === r.suggested_office_code);
      const next: Partial<Fields> = {
        direction: props.canIncoming ? r.direction : "outgoing",
        subject: r.subject ?? "",
        sender_name: r.sender_name ?? "",
        sender_org: r.sender_org ?? "",
        recipient_name: r.recipient_name ?? "",
        recipient_org: r.recipient_org ?? "",
        document_date: /^\d{4}-\d{2}-\d{2}$/.test(r.document_date ?? "") ? r.document_date : "",
        document_type_id: type?.id ?? "",
        category: r.category ?? "",
        keywords: (r.keywords ?? []).join(", "),
        priority: r.priority,
        confidentiality: r.confidentiality,
        forward_to: office && office.id !== props.myOfficeId ? office.id : "",
        description: r.summary ?? "",
        ai_summary: r.summary ?? "",
        content_text: r.extracted_text ?? "",
      };
      setF((p) => ({ ...p, ...next }));
      setAiFilled(new Set(Object.keys(next).filter((k) => next[k as keyof Fields]) as (keyof Fields)[]));
      setAiState("done");
      setAiMsg(
        r.demo
          ? "Demo mode: sample AI output. This demo has no AI key, so the fields come from a prepared sample letter, not your file. Highlighted fields show what the AI fills in; check them before saving."
          : "Fields filled from the document. Highlighted fields came from the assistant; check them before saving.",
      );
    } catch (err) {
      setAiState("error");
      setAiMsg(err instanceof Error ? err.message : "Could not read the document");
    }
  }

  const hl = (k: keyof Fields) => (aiFilled.has(k) ? "bg-brand-50 border-brand-600" : "");
  const incoming = f.direction === "incoming";

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-3">
      <section className="card space-y-3 p-4 lg:col-span-1">
        <h2 className="font-semibold">1. Scanned document</h2>
        <input ref={fileRef} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm" />
        <p className="text-xs text-slate-500">PDF, PNG, JPG or WEBP, up to 10 MB. The file is stored with the record.</p>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={noAi} onChange={(e) => setNoAi(e.target.checked)} className="mt-0.5" />
          <span>Sensitive document: do not send it to the AI. Fill the form by hand.</span>
        </label>
        <button type="button" onClick={readWithAi} className="btn-secondary w-full" disabled={aiState === "reading" || noAi}>
          {aiState === "reading" ? "Reading…" : "Fill the form from this document (AI)"}
        </button>
        {aiMsg && (
          <p className={`rounded-lg p-2 text-sm ${aiState === "error" ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-900"}`}>{aiMsg}</p>
        )}
        {f.content_text && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Text read from the document</summary>
            <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{f.content_text}</p>
          </details>
        )}
        <input type="hidden" name="content_text" value={f.content_text} />
        <input type="hidden" name="ai_summary" value={f.ai_summary} />
      </section>

      <section className="card grid gap-3 p-4 md:grid-cols-2 lg:col-span-2">
        <h2 className="font-semibold md:col-span-2">2. Record details</h2>
        <div>
          <label className="label">Direction</label>
          <select name="direction" className={`input ${hl("direction")}`} value={f.direction} onChange={(e) => set("direction", e.target.value as Fields["direction"])}>
            {props.canIncoming && <option value="incoming">Incoming (received by the City)</option>}
            <option value="outgoing">Outgoing (sent by the City)</option>
          </select>
        </div>
        <div>
          <label className="label">Document type</label>
          <select name="document_type_id" required className={`input ${hl("document_type_id")}`} value={f.document_type_id} onChange={(e) => set("document_type_id", e.target.value)}>
            <option value="">Choose…</option>
            {props.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Subject</label>
          <input name="subject" required className={`input ${hl("subject")}`} value={f.subject} onChange={(e) => set("subject", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <textarea name="description" rows={2} className={`input ${hl("description")}`} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {incoming ? (
          <>
            <div>
              <label className="label">Sender name</label>
              <input name="sender_name" className={`input ${hl("sender_name")}`} value={f.sender_name} onChange={(e) => set("sender_name", e.target.value)} />
            </div>
            <div>
              <label className="label">Sender organization</label>
              <input name="sender_org" className={`input ${hl("sender_org")}`} value={f.sender_org} onChange={(e) => set("sender_org", e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">Recipient name</label>
              <input name="recipient_name" className={`input ${hl("recipient_name")}`} value={f.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} />
            </div>
            <div>
              <label className="label">Recipient organization</label>
              <input name="recipient_org" className={`input ${hl("recipient_org")}`} value={f.recipient_org} onChange={(e) => set("recipient_org", e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="label">Date on document</label>
          <input name="document_date" type="date" className={`input ${hl("document_date")}`} value={f.document_date} onChange={(e) => set("document_date", e.target.value)} />
        </div>
        <div>
          <label className="label">Mode</label>
          <select name="mode" className="input" value={f.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="walk-in">Walk-in</option>
            <option value="courier">Courier</option>
            <option value="mail">Mail</option>
            <option value="email">Email</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        <h2 className="mt-2 font-semibold md:col-span-2">3. Classification and routing</h2>
        <div>
          <label className="label">Category</label>
          <input name="category" className={`input ${hl("category")}`} value={f.category} onChange={(e) => set("category", e.target.value)} />
        </div>
        <div>
          <label className="label">Keywords (comma separated)</label>
          <input name="keywords" className={`input ${hl("keywords")}`} value={f.keywords} onChange={(e) => set("keywords", e.target.value)} />
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" className={`input ${hl("priority")}`} value={f.priority} onChange={(e) => set("priority", e.target.value as Fields["priority"])}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className="label">Confidentiality</label>
          <select name="confidentiality" className={`input ${hl("confidentiality")}`} value={f.confidentiality} onChange={(e) => set("confidentiality", e.target.value as Fields["confidentiality"])}>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
          </select>
        </div>
        <div>
          <label className="label">Forward to office (optional)</label>
          <select name="forward_to" className={`input ${hl("forward_to")}`} value={f.forward_to} onChange={(e) => set("forward_to", e.target.value)}>
            <option value="">Keep in my office</option>
            {props.offices.filter((o) => o.id !== props.myOfficeId).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action due date (optional)</label>
          <input name="due_date" type="date" className="input" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </div>

        <div className="flex items-center justify-end gap-3 md:col-span-2">
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save and issue tracking number"}</button>
        </div>
      </section>
    </form>
  );
}
