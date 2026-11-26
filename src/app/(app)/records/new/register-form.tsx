"use client";

import { useT } from "@/lib/i18n/client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { PDF_NOTE } from "@/lib/image-size";
import { pdfFirstPageToJpeg } from "@/lib/pdf-first-page";
import { shrinkForAi } from "@/lib/shrink-image";
import { useUploadPrep } from "@/components/use-upload-prep";
import { ScanPreview } from "@/components/scan-preview";
import { ARTA_CLASSES, ARTA_DAYS, ARTA_LABEL, artaDue, isArtaClass, manilaDay } from "@/lib/arta";
import { feeShort, prefillFromService, type ServiceOpt } from "@/lib/charter";
import { DEFAULT_REF_LABEL } from "@/lib/reference-no";
import { TX_FORM_LABEL, TX_TYPES } from "@/lib/transaction-type";
import { COPY_TYPE } from "@/lib/copy-request";
import { MAX_EML_BYTES, emlToFields, looksLikeEml, parseEml, pickAttachments } from "@/lib/eml";
import { compressForUpload } from "@/lib/compress-upload";
import { formatBytes } from "@/lib/upload-policy";
import { errorItems, filingSummary, routeFile, serverErrorField } from "@/lib/register-desk";
import { registerRecord } from "./actions";
import { ServicePicker } from "./service-picker";

type Opt = { id: string; name: string };
type OfficeOpt = Opt & { code: string; ref_label?: string | null };

type Fields = {
  direction: "incoming" | "outgoing";
  subject: string;
  description: string;
  document_type_id: string;
  transaction_type: string;
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
  arta_class: string;
  in_reply_to: string;
};

export function RegisterForm(props: {
  types: Opt[];
  offices: OfficeOpt[];
  /** "central": the Records Section; "window": an office's window staff; null: outgoing only */
  incomingMode: "central" | "window" | null;
  myOfficeId: string | null;
  myOfficeName: string;
  /** Label of the reference number box; null hides the box */
  refLabel: string | null;
  services: ServiceOpt[];
  otherServices: ServiceOpt[];
  counts: Record<string, number>;
  barangays?: string[] | null;
  replyTo?: string | null;
  /** Records desk (records officer): "Something else" first and preselected, top 3 services, "Keep at the Records Section". */
  desk?: boolean;
}) {
  const t = useT();
  const desk = !!props.desk;
  const svcDefault = desk ? "other" : "";
  const canIncoming = !!props.incomingMode;
  const [state, action, pending] = useActionState(registerRecord, undefined);
  const [f, setF] = useState<Fields>({
    direction: props.replyTo ? "outgoing" : canIncoming ? "incoming" : "outgoing",
    subject: "",
    description: "",
    document_type_id: "",
    transaction_type: "",
    category: "",
    keywords: "",
    priority: "normal",
    confidentiality: "internal",
    sender_name: "",
    sender_org: "",
    recipient_name: "",
    recipient_org: "",
    // Offices other than the records desk mostly send memos to other City offices
    mode: canIncoming ? "walk-in" : "internal",
    document_date: "",
    due_date: "",
    forward_to: "",
    content_text: "",
    ai_summary: "",
    arta_class: "",
    in_reply_to: props.replyTo ?? "",
  });
  const [svc, setSvc] = useState<string>(svcDefault);
  const [svcError, setSvcError] = useState(false);
  const [refNo, setRefNo] = useState("");
  const pickerRef = useRef<HTMLFieldSetElement>(null);
  const [copyKind, setCopyKind] = useState<"owner" | "representative" | "">("");
  const [aiState, setAiState] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [aiMsg, setAiMsg] = useState("");
  const [aiFilled, setAiFilled] = useState<Set<keyof Fields>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [scanName, setScanName] = useState<string | null>(null);
  const [scanSize, setScanSize] = useState(0);
  const [dropErr, setDropErr] = useState("");
  const [over, setOver] = useState(false);
  const [filledFrom, setFilledFrom] = useState<"file" | "service">("file");
  const pickRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const prep = useUploadPrep(fileRef);
  const extraRef = useRef<HTMLInputElement>(null);
  type EmlPanel = { sender: string; date: string; files: string[]; skipped: { name: string; reason: "type" | "size" }[]; filled: (keyof Fields)[] };
  const [eml, setEml] = useState<EmlPanel | null>(null);
  const [emlErr, setEmlErr] = useState("");
  const [emlBusy, setEmlBusy] = useState(false);

  // React 19 resets uncontrolled inputs after an action that returns an error, so drop the stale preview too.
  useEffect(() => {
    if (state && !fileRef.current?.files?.length) clearScan();
    if (state && !extraRef.current?.files?.length) setEml(null);
    if (state?.error) {
      const id = serverErrorField(state.error);
      const d = id ? document.getElementById(id)?.closest("details") : null;
      if (d) d.open = true;
      requestAnimationFrame(() => summaryRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function showPreview(file: File | undefined) {
    setPreview(file && file.type.startsWith("image/") ? file : null);
    setScanName(file?.name ?? null);
    setScanSize(file?.size ?? 0);
  }

  function clearScan() {
    prep.reset();
    if (fileRef.current) fileRef.current.value = "";
    if (captureRef.current) captureRef.current.value = "";
    setPreview(null);
    setScanName(null);
    setScanSize(0);
  }
  function setInputFiles(input: HTMLInputElement | null, files: File[]) {
    if (!input) return;
    const dt = new DataTransfer();
    files.forEach((x) => dt.items.add(x));
    input.files = dt.files;
  }

  // The email is read in this browser only. Its attachments go into the form like a scan; nothing is sent until Save.
  async function takeEml(file: File | undefined) {
    if (!file) return;
    setEmlErr("");
    if (file.size > MAX_EML_BYTES) {
      setEmlErr("This file is not an email. Save it as .eml and try again.");
      return;
    }
    setEmlBusy(true);
    try {
      if (!looksLikeEml(await file.slice(0, 8192).text())) {
        setEmlErr("This file is not an email. Save it as .eml and try again.");
        return;
      }
      const email = await parseEml(await file.arrayBuffer());
      const fields = emlToFields(email);
      const { kept, skipped } = pickAttachments(email.attachments ?? []);
      const { mode, ...rest } = fields;
      const next: Partial<Fields> = { ...rest, mode };
      setF((p) => ({ ...p, ...next }));
      const filled = (Object.keys(next) as (keyof Fields)[]).filter((k) => k !== "content_text" && next[k]);
      setAiFilled(new Set(filled));
      setFilledFrom("file");
      clearScan();
      if (kept[0]) {
        setInputFiles(fileRef.current, [kept[0]]);
        showPreview(kept[0]);
        void prep.prepare(kept[0]);
      }
      const extras = await Promise.all(kept.slice(1).map(async (x) => (await compressForUpload(x, false)).file));
      setInputFiles(extraRef.current, extras);
      setEml({ sender: fields.sender_name || fields.sender_org || "—", date: fields.document_date || "—", files: kept.map((x) => x.name), skipped, filled: [...filled, "content_text"] });
    } catch {
      setEmlErr("This file is not an email. Save it as .eml and try again.");
    } finally {
      setEmlBusy(false);
    }
  }

  function removeEml() {
    if (eml) {
      const blank = Object.fromEntries(eml.filled.map((k) => [k, k === "mode" ? (canIncoming ? "walk-in" : "internal") : ""]));
      setF((p) => ({ ...p, ...blank }));
      setAiFilled(new Set());
    }
    clearScan();
    setInputFiles(extraRef.current, []);
    setEml(null);
    setEmlErr("");
  }

  // One routed entry for drop and "Choose a file". Emails go to the reader, scans and PDFs to the attachment.
  function takeAny(file: File | undefined) {
    setDropErr("");
    if (!file) return;
    const r = routeFile(file);
    if (r.kind === "error") {
      setDropErr(r.message);
      return;
    }
    if (r.kind === "eml") {
      void takeEml(file);
      return;
    }
    if (eml) removeEml();
    clearScan();
    setInputFiles(fileRef.current, [file]);
    showPreview(file);
    void prep.prepare(file);
    setAiState("idle");
    setAiMsg("");
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

  // Picking a kind of transaction fills the due date; "None" clears it and "Not set" leaves it alone.
  function pickArta(v: string) {
    const cls = isArtaClass(v) ? v : null;
    setF((p) => ({ ...p, arta_class: v, due_date: cls ? (artaDue(cls, manilaDay()) ?? "") : p.due_date }));
  }

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
        direction: canIncoming ? r.direction : "outgoing",
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
      setFilledFrom("file");
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

  const allServices = [...props.services, ...props.otherServices];
  const showPicker = f.direction === "incoming" && allServices.length > 0;
  const chosen = showPicker && svc && svc !== "other" ? allServices.find((x) => x.id === svc) ?? null : null;
  const showKind = !showPicker || svc === "other";
  const refOffice = props.incomingMode === "central" && f.forward_to ? props.offices.find((o) => o.id === f.forward_to) : null;
  const refLabel = props.refLabel === null ? null : props.incomingMode === "central" ? (refOffice?.ref_label ?? DEFAULT_REF_LABEL) : props.refLabel;

  // Picking a service fills in the kind of document, transaction type, ARTA class, due date and confidentiality.
  function pickService(v: string) {
    setSvc(v);
    setSvcError(false);
    const s = v === "other" ? null : allServices.find((x) => x.id === v);
    if (!s) return;
    const p = prefillFromService(s, props.types, manilaDay());
    const next: Partial<Fields> = {
      document_type_id: p.document_type_id,
      transaction_type: p.transaction_type,
      arta_class: p.arta_class === "none" ? "" : p.arta_class,
      due_date: p.due_date,
      ...(p.confidentiality ? { confidentiality: p.confidentiality } : {}),
      ...(props.incomingMode === "central" && s.office_id !== props.myOfficeId ? { forward_to: s.office_id } : {}),
    };
    setF((prev) => ({ ...prev, ...next }));
    setAiFilled(new Set((Object.keys(next) as (keyof Fields)[]).filter((k) => next[k])));
    setFilledFrom("service");
  }

  // QA-034: when the browser blocks Save for empty required fields, also list them in words on the page
  // (GOV.UK-style error summary) and mark each one aria-invalid.
  const [missing, setMissing] = useState<{ id: string; label: string }[]>([]);
  const pendingMissing = useRef<{ id: string; label: string }[] | null>(null);
  function fieldLabel(el: HTMLElement): string {
    const byFor = el.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    const legend = el.closest("fieldset")?.querySelector("legend");
    const isRadio = (el as HTMLInputElement).type === "radio";
    const text = (isRadio
      ? legend?.textContent || el.getAttribute("name")
      : byFor?.textContent || el.closest("label")?.textContent || legend?.textContent || el.getAttribute("name")) ?? "";
    return text.trim().replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").slice(0, 60);
  }
  function onInvalid(e: React.FormEvent<HTMLFormElement>) {
    const el = e.target as HTMLInputElement;
    el.setAttribute("aria-invalid", "true");
    const d = el.closest("details");
    if (d) d.open = true;
    const target = el.type === "radio" ? el.closest("fieldset")?.querySelector("input")?.id || "" : el.id || "";
    if (!pendingMissing.current) {
      pendingMissing.current = [];
      setTimeout(() => {
        setMissing(pendingMissing.current ?? []);
        pendingMissing.current = null;
        requestAnimationFrame(() => summaryRef.current?.focus());
      }, 0);
    }
    const label = fieldLabel(el);
    if (!pendingMissing.current.some((m) => m.label === label)) pendingMissing.current.push({ id: target, label });
  }
  function onFieldChange(e: React.FormEvent<HTMLFormElement>) {
    const el = e.target as HTMLInputElement;
    if (el.getAttribute?.("aria-invalid") === "true" && el.checkValidity?.()) {
      const group = el.type === "radio" && el.form ? [...el.form.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`)] : [el];
      group.forEach((x) => x.removeAttribute("aria-invalid"));
      const label = fieldLabel(el);
      setMissing((m) => m.filter((x) => x.label !== label));
    }
  }

  function goTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const d = el.closest("details");
    if (d) d.open = true;
    el.focus();
    el.scrollIntoView({ block: "center" });
  }

  function pickDirection(v: Fields["direction"]) {
    set("direction", v);
    if (v === "outgoing") {
      setSvc(svcDefault);
      setSvcError(false);
    }
  }

  function checkService(e: React.FormEvent<HTMLFormElement>) {
    setMissing([]); // submit only fires once the browser's own check passed
    if (showPicker && svc === "") {
      e.preventDefault();
      setSvcError(true);
      pickerRef.current?.focus();
      pickerRef.current?.scrollIntoView({ block: "center" });
    }
  }

  const hl = (k: keyof Fields) => (aiFilled.has(k) ? "bg-brand-50 border-brand-600" : "");
  const incoming = f.direction === "incoming";

  const filledNote = (k: keyof Fields) =>
    filledFrom === "file" && aiFilled.has(k) ? <p className="mt-1 text-sm text-brand-900">{t("Filled from the file: check it.")}</p> : null;
  const filingFilled = (["priority", "confidentiality", "mode", "arta_class", "category", "keywords", "document_date", "description", "in_reply_to"] as (keyof Fields)[]).some((k) => aiFilled.has(k));
  const items = errorItems(missing, state?.error);

  const scanInput = <input id="scan" ref={captureRef} type="file" accept="image/*" capture="environment" className="peer/scan sr-only" onChange={(e) => { takeAny(e.target.files?.[0]); e.target.value = ""; }} />;
  const emlStatus = (
    <>
      {emlBusy && <p role="status" className="mt-2 text-sm text-slate-700">{t("Reading the email…")}</p>}
      {emlErr && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{t(emlErr)}</p>}
      {eml && (
        <div role="status" className="mt-2 space-y-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          <p className="font-medium">{t("From {sender} · {date} · {n} attachments", { sender: eml.sender, date: eml.date, n: eml.files.length })}</p>
          {eml.files.length > 0 && <ul className="list-disc pl-5">{eml.files.map((n) => <li key={n} className="break-all">{n}</li>)}</ul>}
          {eml.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-slate-800">
              {eml.skipped.map((x) => (
                <li key={x.name} className="break-all">
                  {t(x.reason === "type" ? "Skipped {file}: only PDF, JPG or PNG are kept." : "Skipped {file}: too big to send with the form. Attach it on the record page after saving.", { file: x.name })}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={removeEml} className="btn-secondary w-full">{t("Remove email")}</button>
        </div>
      )}
    </>
  );
  const extraInput = <input ref={extraRef} type="file" name="extra_file" multiple className="sr-only" aria-hidden tabIndex={-1} />;
  const noAiBox = (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={noAi} onChange={(e) => setNoAi(e.target.checked)} className="checkbox mt-0.5" />
      <span>{t("Sensitive document: do not send it to the AI. Fill the form by hand.")}</span>
    </label>
  );
  const aiButton = (
    <button type="button" onClick={readWithAi} className="btn-secondary w-full" disabled={aiState === "reading" || noAi}>
      {aiState === "reading" ? t("Reading…") : t("Fill the form from this file")}
    </button>
  );
  const aiNote = aiMsg ? (
    <p role="status" className={`rounded-lg p-3 text-sm ${aiState === "error" ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-900"}`}>{t(aiMsg)}</p>
  ) : null;
  const fromScanInput = <input type="hidden" name="from_scan" value={aiState === "done" ? "1" : ""} />;
  const contentDetails = f.content_text ? (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-600">{t("Text read from the document")}</summary>
      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{f.content_text}</p>
    </details>
  ) : null;
  const textInputs = (
    <>
      <input type="hidden" name="content_text" value={f.content_text} />
      <input type="hidden" name="ai_summary" value={f.ai_summary} />
    </>
  );
  const pickerBlock = showPicker ? (
    <>
      <ServicePicker
        ref={pickerRef}
        value={svc}
        onPick={pickService}
        error={svcError}
        services={props.services}
        otherServices={props.otherServices}
        counts={props.counts}
        officeName={props.myOfficeName}
        central={props.incomingMode === "central"}
        offices={props.offices}
        desk={desk}
      />
      <p role="status" className="text-sm text-slate-700 md:col-span-2">
        {chosen
          ? t("Filled in from the Citizen's Charter: {class}, {tx}, due {date}. You can change these below.", {
              class: t(ARTA_LABEL[isArtaClass(chosen.classification) ? chosen.classification : "none"]),
              tx: chosen.tx_types[0] ?? "",
              date: f.due_date || t("not set"),
            })
          : ""}
      </p>
    </>
  ) : null;
  const refBlock =
    refLabel !== null ? (
      <div className="md:col-span-2">
        <label className="label" htmlFor="f-reference_no">{t("{label} (optional)", { label: t(refLabel) })}</label>
        <input id="f-reference_no" name="reference_no" maxLength={40} autoComplete="off" spellCheck={false} className="input font-mono md:max-w-sm" aria-describedby="f-reference_no-hint" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        <p id="f-reference_no-hint" className="mt-1 text-sm text-slate-600">{t("The number this document has in another system. Leave blank if none.")}</p>
      </div>
    ) : null;
  const svcHidden = chosen ? (
    <>
      <input type="hidden" name="service_id" value={chosen.id} />
      <input type="hidden" name="document_type_id" value={f.document_type_id} />
    </>
  ) : null;
  const kindBlock = showKind ? (
    <div>
      <label className="label" htmlFor="f-document_type_id">{t("Kind of document")}</label>
      <select id="f-document_type_id" name="document_type_id" required aria-required="true" className={`input ${hl("document_type_id")}`} value={f.document_type_id} onChange={(e) => set("document_type_id", e.target.value)}>
        <option value="">{t("Choose…")}</option>
        {props.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {filledNote("document_type_id")}
    </div>
  ) : null;
  const txBlock = (
    <fieldset className="md:col-span-2" aria-describedby="f-tx-hint">
      <legend className="label">{t("Transaction type")}</legend>
      <p id="f-tx-hint" className="mb-2 text-sm text-slate-600">{t("Pick Government for letters from or to another government office.")}</p>
      <div className="grid gap-1">
        {TX_TYPES.map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-3">
            <input type="radio" id={`f-tx-${k}`} name="transaction_type" value={k} required checked={f.transaction_type === k} onChange={() => set("transaction_type", k)} />
            <span>{t(TX_FORM_LABEL[k])}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  const copyBlock =
    props.incomingMode === "central" && props.types.find((x) => x.id === f.document_type_id)?.name === COPY_TYPE ? (
      <fieldset className="md:col-span-2 grid gap-3 rounded-md border-2 border-slate-200 p-3 md:grid-cols-2">
        <legend className="label px-1">{t("About the copy")}</legend>
        <div className="md:col-span-2">
          <label className="label" htmlFor="f-copy_source">{t("Tracking number of the record asked for")}</label>
          <input id="f-copy_source" name="copy_source" required aria-required="true" className="input font-mono uppercase" placeholder="IN-2026-0001" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="f-copy_pages">{t("Number of pages")}</label>
          <input id="f-copy_pages" name="copy_pages" type="number" min={1} max={5000} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="f-copy_fee">{t("Fee (₱)")}</label>
          <input id="f-copy_fee" name="copy_fee" inputMode="decimal" className="input" />
        </div>
        <fieldset className="md:col-span-2">
          <legend className="label">{t("Who is asking?")}</legend>
          <div className="grid gap-1">
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="copy_requester" value="owner" required checked={copyKind === "owner"} onChange={() => setCopyKind("owner")} />
              <span>{t("The owner")}</span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="copy_requester" value="representative" required checked={copyKind === "representative"} onChange={() => setCopyKind("representative")} />
              <span>{t("A representative")}</span>
            </label>
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 md:col-span-2">
          <input type="checkbox" name="copy_id" className="checkbox" />
          <span>{t("Valid ID checked")}</span>
        </label>
        {copyKind === "representative" && (
          <label className="flex min-h-11 items-center gap-3 md:col-span-2">
            <input type="checkbox" name="copy_auth" className="checkbox" required aria-required="true" />
            <span>{t("Authorization letter or SPA checked")}</span>
          </label>
        )}
      </fieldset>
    ) : null;
  const subjectBlock = (
    <div className="md:col-span-2">
      <label className="label" htmlFor="f-subject">{t("Subject (what it is about)")}</label>
      <input id="f-subject" name="subject" required aria-required="true" className={`input ${hl("subject")}`} value={f.subject} onChange={(e) => set("subject", e.target.value)} />
      {filledNote("subject")}
    </div>
  );
  const descBlock = (
    <div className="md:col-span-2">
      <label className="label" htmlFor="f-description">{t("Short description (optional)")}</label>
      <textarea id="f-description" name="description" rows={2} className={`input ${hl("description")}`} value={f.description} onChange={(e) => set("description", e.target.value)} />
      {filledNote("description")}
    </div>
  );
  const senderFields = (
    <>
      <div>
        <label className="label" htmlFor="f-sender_name">{t("Name (optional)")}</label>
        <input id="f-sender_name" name="sender_name" className={`input ${hl("sender_name")}`} value={f.sender_name} onChange={(e) => set("sender_name", e.target.value)} />
        {filledNote("sender_name")}
      </div>
      <div>
        <label className="label" htmlFor="f-sender_org">{t("Office, barangay or company (optional)")}</label>
        <input id="f-sender_org" name="sender_org" className={`input ${hl("sender_org")}`} value={f.sender_org} onChange={(e) => set("sender_org", e.target.value)} />
        {filledNote("sender_org")}
      </div>
    </>
  );
  const recipientFields = (
    <>
      <div>
        <label className="label" htmlFor="f-recipient_name">{t("Name (optional)")}</label>
        <input id="f-recipient_name" name="recipient_name" className={`input ${hl("recipient_name")}`} value={f.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} />
        {filledNote("recipient_name")}
      </div>
      <div>
        <label className="label" htmlFor="f-recipient_org">{t("Office, barangay or company (optional)")}</label>
        <input id="f-recipient_org" name="recipient_org" className={`input ${hl("recipient_org")}`} value={f.recipient_org} onChange={(e) => set("recipient_org", e.target.value)} />
        {filledNote("recipient_org")}
      </div>
    </>
  );
  const replyBlock = (
    <div className="md:col-span-2">
      <label className="label" htmlFor="f-in_reply_to">{t("In reply to (optional)")}</label>
      <input id="f-in_reply_to" name="in_reply_to" className="input font-mono" placeholder="IN-2026-0001" aria-describedby="f-in_reply_to-help" value={f.in_reply_to} onChange={(e) => set("in_reply_to", e.target.value)} />
      <p id="f-in_reply_to-help" className="mt-1 text-sm text-slate-600">{t("Answering a letter the City received? Type its tracking number. Both records will link to each other.")}</p>
    </div>
  );
  const barangayBlock = props.barangays ? (
    <div>
      <label className="label" htmlFor="f-barangay">{t("Barangay it is about (optional)")}</label>
      <select id="f-barangay" name="barangay" className="input" defaultValue="">
        <option value="">{t("None, or not about a place")}</option>
        {props.barangays.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
    </div>
  ) : null;
  const docDateBlock = (
    <div>
      <label className="label" htmlFor="f-document_date">{t("Date written on the document (optional)")}</label>
      <input id="f-document_date" name="document_date" type="date" className={`input ${hl("document_date")}`} value={f.document_date} onChange={(e) => set("document_date", e.target.value)} />
      {filledNote("document_date")}
    </div>
  );
  const modeBlock = (
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
  );
  const categoryBlock = (
    <div>
      <label className="label" htmlFor="f-category">{t("Subject area (optional)")}</label>
      <input id="f-category" name="category" className={`input ${hl("category")}`} value={f.category} onChange={(e) => set("category", e.target.value)} />
    </div>
  );
  const keywordsBlock = (
    <div>
      <label className="label" htmlFor="f-keywords">{t("Search words (optional)")}</label>
      <input id="f-keywords" name="keywords" className={`input ${hl("keywords")}`} value={f.keywords} onChange={(e) => set("keywords", e.target.value)} />
    </div>
  );
  const priorityBlock = (
    <div>
      <label className="label" htmlFor="f-priority">{t("Priority")}</label>
      <select id="f-priority" name="priority" className={`input ${hl("priority")}`} value={f.priority} onChange={(e) => set("priority", e.target.value as Fields["priority"])}>
        <option value="low">{t("Low")}</option>
        <option value="normal">{t("Normal")}</option>
        <option value="urgent">{t("Urgent")}</option>
      </select>
    </div>
  );
  const confBlock = (
    <fieldset className={`min-w-0 rounded-md border-2 p-1 ${hl("confidentiality") || "border-transparent"}`}>
      <legend className="label">{t("Who may see it")}</legend>
      {([
        ["public", "Public", "Anyone in the City offices"],
        ["internal", "Internal", "City staff involved with it"],
        ["confidential", "Confidential", "Records desk and handling offices only"],
      ] as const).map(([v, name, hint]) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-brand-50">
          <input type="radio" name="confidentiality" value={v} checked={f.confidentiality === v} onChange={() => set("confidentiality", v)} className="checkbox mt-0.5" />
          <span><span className="font-semibold">{t(name)}</span><span className="block text-sm text-slate-600">{t(hint)}</span></span>
        </label>
      ))}
    </fieldset>
  );
  const forwardBlock = (
    <div>
      <label className="label" htmlFor="f-forward_to">{t("Send to office (optional)")}</label>
      <select id="f-forward_to" name="forward_to" className={`input ${hl("forward_to")}`} value={f.forward_to} onChange={(e) => set("forward_to", e.target.value)}>
        <option value="">{desk ? t("Keep at the Records Section") : t("Keep in my office")}</option>
        {props.offices.filter((o) => o.id !== props.myOfficeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {filledNote("forward_to")}
    </div>
  );
  const artaBlock = (
    <div>
      <label className="label" htmlFor="f-arta_class">{t("ARTA processing time (optional)")}</label>
      <p id="f-arta_class-hint" className="mb-2 text-sm text-slate-600">{t("Anti-Red Tape Act. Picking one fills in the date below.")}</p>
      <select id="f-arta_class" name="arta_class" aria-describedby="f-arta_class-hint" className="input" value={f.arta_class} onChange={(e) => pickArta(e.target.value)}>
        <option value="">{t("Not set")}</option>
        {ARTA_CLASSES.map((c) => <option key={c} value={c}>{t(ARTA_LABEL[c])}</option>)}
      </select>
    </div>
  );
  const dueBlock = (
    <div>
      <label className="label" htmlFor="f-due_date">{t("Must be acted on by (optional)")}</label>
      <input id="f-due_date" name="due_date" type="date" className="input" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
      {f.arta_class in ARTA_DAYS && (
        <p className="mt-1 text-sm text-slate-600">{t("Counted {n} working days from today, skipping weekends and holidays. You can change the date.", { n: ARTA_DAYS[f.arta_class as keyof typeof ARTA_DAYS] })}</p>
      )}
    </div>
  );
  const feeLine = chosen ? (
    <p className="text-sm text-slate-700 md:col-span-2">
      {feeShort(chosen) === "No fee" ? t("No fee") : t("Charter fee: {fee}", { fee: chosen.fee_text ?? t(feeShort(chosen)) })}
    </p>
  ) : null;
  const cancelSave = (
    <>
      <Link href="/records" className="btn-secondary"><span className="sm:hidden">{t("Cancel")}</span><span className="hidden sm:inline">{t("Cancel (nothing is saved)")}</span></Link>
      <button className="btn-primary" disabled={pending || prep.busy || prep.tooBig}>{pending ? t("Saving…") : <><span className="sm:hidden">{t("Save")}</span><span className="hidden sm:inline">{t("Save and get tracking number")}</span></>}</button>
    </>
  );

  const deskBody = (
    <>
      {items.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="err-h" className="rounded-lg border-2 border-red-700 bg-white p-4">
          <h2 id="err-h" className="text-lg font-bold text-red-800">{t("There is a problem")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {items.map((it) => (
              <li key={it.text}>
                {it.id ? (
                  <a href={"#" + it.id} onClick={(e) => { e.preventDefault(); goTo(it.id as string); }} className="font-semibold text-red-800 underline">{it.server ? t(it.text) : it.text}</a>
                ) : (
                  <span className="font-semibold text-red-800">{it.server ? t(it.text) : it.text}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-slate-700">{t("Every field needs an answer unless it says (optional).")}</p>

      <div
        className={`rounded-lg border-2 border-dashed p-4 sm:p-6 ${over ? "border-brand-600 bg-brand-50" : "border-line"}`}
        onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); takeAny(e.dataTransfer.files?.[0]); }}
      >
        <p className="mb-3 hidden text-center text-slate-700 sm:block">{t("Drop a scan, a PDF or an email file here")}</p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center sm:gap-3">
          {scanInput}
          <label htmlFor="scan" className="btn-primary min-h-11 cursor-pointer justify-center text-center peer-focus-visible/scan:outline-3 peer-focus-visible/scan:outline-offset-2 peer-focus-visible/scan:outline-brand-700">{t("Scan document")}</label>
          <input id="file-pick" ref={pickRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.eml,message/rfc822" className="peer/pick sr-only" onChange={(e) => { takeAny(e.target.files?.[0]); e.target.value = ""; }} />
          <label htmlFor="file-pick" className="btn-secondary min-h-11 cursor-pointer justify-center text-center peer-focus-visible/pick:outline-3 peer-focus-visible/pick:outline-offset-2 peer-focus-visible/pick:outline-brand-700">{t("Choose a file")}</label>
        </div>
        <input id="file" ref={fileRef} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" aria-hidden tabIndex={-1} />
      </div>
      {dropErr && <p role="alert" className="text-sm text-red-800">{t(dropErr)}</p>}
      {emlStatus}
      {extraInput}
      {prep.controls}
      {prep.fields}

      {scanName && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 break-all font-medium">{scanName}{scanSize ? ` · ${formatBytes(scanSize)}` : ""}</p>
            <button type="button" onClick={retake} className="btn-secondary min-h-11" disabled={aiState === "reading"}>{t("Remove")}</button>
          </div>
          {preview && <ScanPreview image={preview} label={t("Preview of the scanned page")} />}
          {aiButton}
          {noAiBox}
        </div>
      )}
      {aiNote}
      {contentDetails}
      {fromScanInput}
      {textInputs}

      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">{t(incoming ? "What arrived" : "What is being sent")}</h2>
        <fieldset className={`md:col-span-2 min-w-0 rounded-md border-2 p-1 ${hl("direction") || "border-transparent"}`}>
          <legend className="label">{t("Received or sent out?")}</legend>
          {canIncoming && (
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="direction" id="f-direction-incoming" value="incoming" checked={incoming} onChange={() => pickDirection("incoming")} />
              <span>{t(props.incomingMode === "window" ? "Incoming (handed in at our window)" : "Received by the City")}</span>
            </label>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="direction" id="f-direction-outgoing" value="outgoing" checked={!incoming} onChange={() => pickDirection("outgoing")} />
            <span>{t("Sent out by the City")}</span>
          </label>
        </fieldset>
        {props.incomingMode === "window" && incoming && (
          <div className="text-sm text-slate-600 md:col-span-2">
            <p className="font-semibold text-slate-700">{t("Received at: {office} window", { office: props.myOfficeName })}</p>
            <p>{t("Log only what clients hand in here. Letters addressed to the City or the Mayor go to the Records Section.")}</p>
          </div>
        )}
        {!canIncoming && (
          <p className="text-sm text-slate-600 md:col-span-2">{t("Letters that arrive from outside are logged by the Records Section. Memos to another City office are logged here as outgoing.")}</p>
        )}
        {subjectBlock}
        <fieldset className="md:col-span-2 grid gap-4 md:grid-cols-2">
          <legend className="label">{incoming ? t("Who sent it") : t("Who it goes to")}</legend>
          {incoming ? senderFields : recipientFields}
        </fieldset>
        {pickerBlock}
        {kindBlock}
        {copyBlock}
        {txBlock}
        {svcHidden}
        {feeLine}
      </section>

      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">{t("Where it goes")}</h2>
        {forwardBlock}
        {dueBlock}
      </section>

      <details className="card p-5">
        <summary className="min-h-11 cursor-pointer py-1">
          <span className="text-lg font-bold">{t("Filing details")}</span>
          <span className="block text-sm text-slate-600">{filingSummary(f, t)}{filingFilled ? " " + t("Filled in for you. Open to change.") : ""}</span>
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {priorityBlock}
          {confBlock}
          {modeBlock}
          {artaBlock}
          {categoryBlock}
          {keywordsBlock}
          {barangayBlock}
          {docDateBlock}
          {refBlock}
          {descBlock}
          {!incoming && replyBlock}
        </div>
      </details>

      <div data-sticky-actions className="sticky bottom-0 grid grid-cols-2 items-center gap-2 border-t border-slate-300 bg-white py-2 sm:flex sm:justify-between sm:py-3">
        {cancelSave}
      </div>
    </>
  );

  return (
    <form action={action} onSubmit={checkService} onInvalidCapture={onInvalid} onChangeCapture={onFieldChange} onReset={() => { clearScan(); setSvc(svcDefault); setSvcError(false); setRefNo(""); setMissing([]); }} className="space-y-4">
      {deskBody}
    </form>
  );
}
