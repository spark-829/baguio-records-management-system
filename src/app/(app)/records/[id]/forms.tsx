"use client";

import { useT } from "@/lib/i18n/client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useUploadPrep } from "@/components/use-upload-prep";
import { ACTIONS, type ActionKind } from "@/lib/workflow";
import { addAttachment, deleteRecord, recordAction } from "./actions";

type Office = { id: string; code: string; name: string };

/**
 * The "Take action" panel. It stays closed until the person asks for it, so nothing is saved by a stray click,
 * and every save shows a plain "Are you sure?" step first.
 */
export function ActionForm({ recordId, trackingNo, actions, offices, returnTo }: { recordId: string; trackingNo: string; actions: ActionKind[]; offices: Office[]; returnTo?: Office | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(recordAction, undefined);
  const canReturn = Boolean(returnTo && actions.includes("forward") && offices.some((o) => o.id === returnTo.id));
  // "Add a note" comes first when allowed: the safest choice is the default
  const ordered = [...actions].sort((a, b) => Number(b === "remark") - Number(a === "remark"));
  const choices: { value: string; label: string }[] = [
    ...ordered.slice(0, 1).map((a) => ({ value: a, label: t(ACTIONS[a].label) })),
    ...(canReturn ? [{ value: "return", label: t("Send back to {office}", { office: returnTo!.name }) }] : []),
    ...ordered.slice(1).map((a) => ({ value: a, label: t(ACTIONS[a].label) })),
  ];
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(choices[0].value);
  const opener = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const confirmBox = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  // Keyboard users: focus moves into the panel when it opens, to the question when confirming, and back when it closes.
  useEffect(() => {
    if (open) firstField.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const [office, setOffice] = useState("");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (confirming) confirmBox.current?.focus();
  }, [confirming]);
  const close = () => {
    setOpen(false);
    setConfirming(false);
  };
  const [saving, setSaving] = useState(false);
  const before = useRef(state);
  const busy = saving || pending;
  // When the save comes back (a new result arrives): close the panel if it worked, or stay open with the message.
  useEffect(() => {
    if (!saving || pending || state === before.current) return;
    setSaving(false);
    setConfirming(false);
    if (state?.ok) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);
  const kind: ActionKind = choice === "return" ? "forward" : (choice as ActionKind);
  const toOffice = choice === "return" ? returnTo!.id : office;
  const officeLabel = offices.find((o) => o.id === toOffice)?.name;
  const summary =
    kind === "forward"
      ? t("Send {no} to {office}?", { no: trackingNo, office: officeLabel ?? t("the office you chose") })
      : `${t(ACTIONS[kind].label).replace(/\s*\(.*\)$/, "")}: ${trackingNo}?`;

  if (!open)
    return (
      <div className="space-y-2">
        {pending && <p className="text-sm text-slate-700" role="status">{t("Saving…")}</p>}
        {!pending && state?.ok && <p className="text-sm text-emerald-700" role="status">{t(state.ok)}</p>}
        {!pending && state?.error && <p className="text-sm text-red-700" role="alert">{t("Not saved:")} {t(state.error)}</p>}
        <button ref={opener} type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>
          {t("Add a note or send to another office")}
        </button>
      </div>
    );

  return (
    <form
      action={(fd) => {
        // Like Gmail's "Sending…": the panel stays open with a disabled "Saving…" button until the save
        // has finished, so nobody presses it twice while waiting (QA-011).
        before.current = state;
        setSaving(true);
        return action(fd);
      }}
      onSubmit={(e) => {
        // Pressing Enter in a text box must never save straight away: it asks first.
        if (!confirming) {
          e.preventDefault();
          if (!(choice === "forward" && !office)) setConfirming(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (confirming) setConfirming(false);
          else close();
        }
      }}
      className="space-y-3"
      key={actions.join()}
    >
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "forward" && <input type="hidden" name="to_office_id" value={toOffice} />}
      <div>
        <label className="label" htmlFor="act-kind">{t("What do you want to do?")}</label>
        <select ref={firstField} id="act-kind" className="input" value={choice} onChange={(e) => { setChoice(e.target.value); setConfirming(false); }}>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {choice === "forward" && (
        <div>
          <label className="label" htmlFor="act-office">{t("Send to which office?")}</label>
          <select id="act-office" className="input" value={office} onChange={(e) => { setOffice(e.target.value); setConfirming(false); }} required>
            <option value="">{t("Choose an office…")}</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="act-taken">{t("What was done? (optional)")}</label>
        <input id="act-taken" name="action_taken" className="input" placeholder={t("e.g. Site inspected, voucher signed")} />
      </div>
      <div>
        <label className="label" htmlFor="act-remarks">{t(kind === "forward" ? "Note for the next office (optional)" : "Note (optional)")}</label>
        <textarea id="act-remarks" name="remarks" rows={3} className="input" placeholder={t("e.g. Please inspect within 3 working days")} />
      </div>
      {state?.error && <p className="text-sm text-red-700" role="alert">{t(state.error)}</p>}
      {confirming ? (
        <div ref={confirmBox} tabIndex={-1} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label={t("Please confirm")} aria-describedby="act-confirm-q">
          <p id="act-confirm-q" className="font-medium text-amber-950">{summary}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} aria-busy={busy}>{t(busy ? "Saving…" : "Yes, save it")}</button>
            <button type="button" className="btn-secondary flex-1" disabled={busy} onClick={() => setConfirming(false)}>{t("No, go back")}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={choice === "forward" && !office}>
            {t("Save")}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={close}>
            {t("Cancel")}
          </button>
        </div>
      )}
    </form>
  );
}

export function AttachForm({ recordId }: { recordId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(addAttachment, undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const prep = useUploadPrep(fileRef);
  useEffect(() => {
    if (state) prep.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <label className="label" htmlFor="attach-file">{t("Add a scanned file (PDF, JPG or PNG)")}</label>
      <input id="attach-file" ref={fileRef} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="file-input" required onChange={(e) => void prep.prepare(e.target.files?.[0])} />
      {prep.controls}
      {prep.fields}
      {state?.error && <p className="text-sm text-red-700">{t(state.error, state.vars)}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{t(state.ok)}</p>}
      <button className="btn-secondary w-full" disabled={pending || prep.busy}>{t(pending ? "Uploading…" : "Attach file")}</button>
    </form>
  );
}

export function DeleteForm({ recordId }: { recordId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(deleteRecord, undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 hover:underline">
        {t("Delete this record…")}
      </button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <label className="label" htmlFor="reason">{t("Reason for deleting")}</label>
      <input id="reason" name="reason" className="input" placeholder={t("e.g. Duplicate of IN-2026-0004")} minLength={5} required />
      <p className="text-xs text-slate-500">{t("The record moves to the deleted-records bin. Only an administrator can restore it. This is logged.")}</p>
      {state?.error && <p className="text-sm text-red-700">{t(state.error)}</p>}
      <div className="flex gap-2">
        <button className="btn rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800" disabled={pending}>
          {t(pending ? "Deleting…" : "Yes, move to bin")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
  );
}
