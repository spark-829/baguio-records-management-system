"use client";

import { useT } from "@/lib/i18n/client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { PDF_NOTE } from "@/lib/image-size";
import { pdfFirstPageToJpeg } from "@/lib/pdf-first-page";
import { shrinkForAi } from "@/lib/shrink-image";
import { useUploadPrep } from "@/components/use-upload-prep";
import { ScanPreview } from "@/components/scan-preview";
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

export function RegisterForm(props: { types: Opt[]; offices: OfficeOpt[]; canIncoming: boolean; myOfficeId: string | null; barangays?: string[] | null }) {
  const t = useT();
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
    // Offices other than the records desk mostly send memos to other City offices
    mode: props.canIncoming ? "walk-in" : "internal",
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
  const captureRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [scanName, setScanName] = useState<string | null>(null);

  const prep = useUploadPrep(fileRef);

  // React 19 resets uncontrolled inputs after an action that returns an error, so drop the stale preview too.
  useEffect(() => {
    if (state && !fileRef.current?.files?.length) clearScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function showPreview(file: File | undefined) {
    setPreview(file && file.type.startsWith("image/") ? file : null);
    setScanName(file?.name ?? null);
  }

  // The scan input copies its image into the main file input (memory only, never saved to the device), so the original is saved as the attachment.
  function takeScan(e: React.ChangeEvent<HTMLInputElement>) {
    const scan = e.target.files?.[0];
    if (!scan || !fileRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(scan);
    fileRef.current.files = dt.files;
    e.target.value = "";
    showPreview(scan);
    void prep.prepare(scan);
  }

  function clearScan() {
    prep.reset();
    if (fileRef.current) fileRef.current.value = "";
    if (captureRef.current) captureRef.current.value = "";
    setPreview(null);
    setScanName(null);
  }
  function retake() {
    clearScan();
    setAiState("idle");
    setAiMsg("");
  }

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
      setAiMsg("Choose the scanned file first, using the button above. No scan? Fill in the form by hand.");
      return;
    }
    setAiState("reading");
    setAiMsg("Reading the document…");
    try {
      let toSend: File = file;
      if (file.type === "application/pdf") {
        const page = await pdfFirstPageToJpeg(file);
        if (!page) {
          setAiState("error");
          setAiMsg(PDF_NOTE);
          return;
        }
        setPreview(page); // page preview, like scan apps
        toSend = page;
      }
      const small = await shrinkForAi(toSend);
      const body = new FormData();
      body.append("file", small);
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
      const filled = Object.keys(next).filter((k) => next[k as keyof Fields]).length;
      setAiState("done");
      const base = r.demo
        ? t("Practice version: the fields below come from a prepared sample letter, not your file. Highlighted fields show what the assistant fills in. Check them before saving.")
        : t("{n} fields were filled by the assistant and are highlighted. Please check them before saving.", { n: filled });
      setAiMsg(r.note ? `${t(r.note)} ${base}` : base);
    } catch (err) {
      setAiState("error");
      setAiMsg(err instanceof Error ? err.message : "Could not read the document");
    }
  }

  const hl = (k: keyof Fields) => (aiFilled.has(k) ? "bg-brand-50 border-brand-600" : "");
  const incoming = f.direction === "incoming";

  return (
    <form action={action} onReset={clearScan} className="grid gap-4 lg:grid-cols-3">
      <section className="card space-y-4 p-5 lg:col-span-1">
        <h2 className="text-lg font-bold">{t("1. Scanned copy (optional)")}</h2>
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-800">
          <strong>{t("No scan?")}</strong> {t("That is fine. Just fill in the form and press Save.")}
        </p>
        <label htmlFor="scan" className="btn-primary flex w-full cursor-pointer items-center justify-center text-center">{t("Scan document")}</label>
        <input id="scan" ref={captureRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={takeScan} />
        <p className="text-sm text-slate-600">{t("Scans go straight to the secure record and aren't kept on this device.")}</p>
        <label htmlFor="file" className="label">{t("Or upload a file from the office scanner")}</label>
        <input id="file" ref={fileRef} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="file-input" onChange={(e) => { const f = e.target.files?.[0]; showPreview(f); void prep.prepare(f); }} />
        {prep.controls}
        {prep.fields}
        <p className="text-sm text-slate-600">{t("PDF, JPG or PNG from a scanner, up to 10 MB. The file is kept with the record.")}</p>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={noAi} onChange={(e) => setNoAi(e.target.checked)} className="checkbox mt-0.5" />
          <span>{t("Sensitive document: do not send it to the AI. Fill the form by hand.")}</span>
        </label>
        <button type="button" onClick={readWithAi} className="btn-secondary w-full" disabled={aiState === "reading" || noAi}>
          {t(aiState === "reading" ? "Reading…" : "Read scan with AI")}
        </button>
        {aiMsg && (
          <p role="status" className={`rounded-lg p-3 text-sm ${aiState === "error" ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-900"}`}>{t(aiMsg)}</p>
        )}
        {scanName && (
          <div className="space-y-2">
            {preview ? (
              <ScanPreview image={preview} label={t("Preview of the scanned page")} />
            ) : (
              <p className="truncate text-sm text-slate-700">{scanName}</p>
            )}
            <button type="button" onClick={retake} className="btn-secondary w-full" disabled={aiState === "reading"}>{t("Retake")}</button>
          </div>
        )}
        <input type="hidden" name="from_scan" value={aiState === "done" ? "1" : ""} />
        {f.content_text && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">{t("Text read from the document")}</summary>
            <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{f.content_text}</p>
          </details>
        )}
        <input type="hidden" name="content_text" value={f.content_text} />
        <input type="hidden" name="ai_summary" value={f.ai_summary} />
      </section>

      <section className="card grid gap-4 p-5 md:grid-cols-2 lg:col-span-2">
        <h2 className="text-lg font-bold md:col-span-2">{t("2. About the document")}</h2>
        <p className="text-sm text-slate-600 md:col-span-2">{t("Boxes marked")} <span className="font-semibold text-red-700">*</span> {t("must be filled in. The rest are optional.")}</p>
        <div>
          <label className="label" htmlFor="f-direction">{t("Received or sent out?")}</label>
          <select id="f-direction" name="direction" className={`input ${hl("direction")}`} value={f.direction} onChange={(e) => set("direction", e.target.value as Fields["direction"])}>
            {props.canIncoming && <option value="incoming">{t("Incoming (received by the City)")}</option>}
            <option value="outgoing">{t("Outgoing (sent by the City or your office)")}</option>
          </select>
          {!props.canIncoming && (
            <p className="mt-1 text-sm text-slate-600">{t("Letters that arrive from outside are logged by the Records Section. Memos to another City office are logged here as outgoing.")}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="f-document_type_id">{t("Kind of document")} <Req /></label>
          <select id="f-document_type_id" name="document_type_id" required className={`input ${hl("document_type_id")}`} value={f.document_type_id} onChange={(e) => set("document_type_id", e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {props.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="f-subject">{t("Subject (what it is about)")} <Req /></label>
          <input id="f-subject" name="subject" required className={`input ${hl("subject")}`} value={f.subject} onChange={(e) => set("subject", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="f-description">{t("Short description")}</label>
          <textarea id="f-description" name="description" rows={2} className={`input ${hl("description")}`} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {incoming ? (
          <>
            <div>
              <label className="label" htmlFor="f-sender_name">{t("Name of sender")}</label>
              <input id="f-sender_name" name="sender_name" className={`input ${hl("sender_name")}`} value={f.sender_name} onChange={(e) => set("sender_name", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="f-sender_org">{t("Sender's office, barangay or company")}</label>
              <input id="f-sender_org" name="sender_org" className={`input ${hl("sender_org")}`} value={f.sender_org} onChange={(e) => set("sender_org", e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="f-recipient_name">{t("Name of recipient")}</label>
              <input id="f-recipient_name" name="recipient_name" className={`input ${hl("recipient_name")}`} value={f.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="f-recipient_org">{t("Recipient's office, barangay or company")}</label>
              <input id="f-recipient_org" name="recipient_org" className={`input ${hl("recipient_org")}`} value={f.recipient_org} onChange={(e) => set("recipient_org", e.target.value)} />
            </div>
          </>
        )}
        {props.barangays && (
          <div>
            <label className="label" htmlFor="f-barangay">{t("Barangay it is about (optional)")}</label>
            <select id="f-barangay" name="barangay" className="input" defaultValue="">
              <option value="">{t("None, or not about a place")}</option>
              {props.barangays.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="f-document_date">{t("Date written on the document")}</label>
          <input id="f-document_date" name="document_date" type="date" className={`input ${hl("document_date")}`} value={f.document_date} onChange={(e) => set("document_date", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-mode">{t(incoming ? "How it arrived" : "How it will be sent")}</label>
          <select id="f-mode" name="mode" className="input" value={f.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="walk-in">{t("Hand-carried (walk-in)")}</option>
            <option value="courier">{t("Courier")}</option>
            <option value="mail">{t("Mail")}</option>
            <option value="email">{t("Email")}</option>
            <option value="internal">{t(incoming ? "From another City office" : "To another City office")}</option>
          </select>
        </div>

        <h2 className="mt-4 border-t border-slate-200 pt-4 text-lg font-bold md:col-span-2">{t("3. Filing and where it goes next")}</h2>
        <div>
          <label className="label" htmlFor="f-category">{t("Subject area (optional)")}</label>
          <input id="f-category" name="category" className={`input ${hl("category")}`} value={f.category} onChange={(e) => set("category", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-keywords">{t("Search words (optional)")}</label>
          <input id="f-keywords" name="keywords" className={`input ${hl("keywords")}`} value={f.keywords} onChange={(e) => set("keywords", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-priority">{t("Priority")}</label>
          <select id="f-priority" name="priority" className={`input ${hl("priority")}`} value={f.priority} onChange={(e) => set("priority", e.target.value as Fields["priority"])}>
            <option value="low">{t("Low")}</option>
            <option value="normal">{t("Normal")}</option>
            <option value="urgent">{t("Urgent")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-confidentiality">{t("Who may see it")}</label>
          <select id="f-confidentiality" name="confidentiality" className={`input ${hl("confidentiality")}`} value={f.confidentiality} onChange={(e) => set("confidentiality", e.target.value as Fields["confidentiality"])}>
            <option value="public">{t("Public: anyone in the City offices")}</option>
            <option value="internal">{t("Internal: City staff involved with it")}</option>
            <option value="confidential">{t("Confidential: records desk and handling offices only")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-forward_to">{t("Send to office (optional)")}</label>
          <select id="f-forward_to" name="forward_to" className={`input ${hl("forward_to")}`} value={f.forward_to} onChange={(e) => set("forward_to", e.target.value)}>
            <option value="">{t("Keep in my office")}</option>
            {props.offices.filter((o) => o.id !== props.myOfficeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-due_date">{t("Must be acted on by (optional)")}</label>
          <input id="f-due_date" name="due_date" type="date" className="input" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </div>

        <div className="sticky bottom-0 -mx-5 -mb-5 grid grid-cols-[auto_1fr] items-center gap-2 rounded-b-xl border-t border-slate-300 bg-white px-5 py-2 sm:flex sm:justify-end sm:gap-3 sm:py-3 md:col-span-2">
          {state?.error && <p className="col-span-2 text-sm text-red-700 sm:mr-auto" role="alert">{t(state.error)}</p>}
          <Link href="/records" className="btn-secondary">{t("Cancel")}<span className="hidden sm:inline">{t(" (nothing is saved)")}</span></Link>
          <button className="btn-primary" disabled={pending || prep.busy}>{pending ? t("Saving…") : <>{t("Save")}<span className="hidden sm:inline">{t(" and get tracking number")}</span></>}</button>
        </div>
      </section>
    </form>
  );
}

function Req() {
  const t = useT();
  return (
    <span className="font-semibold text-red-700" aria-label={t("required")}>
      *
    </span>
  );
}
