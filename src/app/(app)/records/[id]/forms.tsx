"use client";

import { useT } from "@/lib/i18n/client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useUploadPrep } from "@/components/use-upload-prep";
import { ACTIONS, type ActionKind } from "@/lib/workflow";
import { normalizeBoxCode } from "@/lib/boxes";
import { COURIERS, METHOD_LABEL, SEND_METHODS, historyHow, needsTracking, parseReleaseForm, type ReleaseErrors } from "@/lib/dispatch";
import { addAttachment, assignRecord, decideCopy, deleteRecord, recordAction, releaseCopy } from "./actions";

type Office = { id: string; code: string; name: string };

/**
 * The "Take action" panel. It stays closed until the person asks for it, so nothing is saved by a stray click,
 * and every save shows a plain "Are you sure?" step first.
 */
export type ActionExtras = { today: string; boxField: boolean; currentBox: string | null; deliveryOpen: boolean };

export function ActionForm({ recordId, trackingNo, actions, offices, returnTo, extras }: { recordId: string; trackingNo: string; actions: ActionKind[]; offices: Office[]; returnTo?: Office | null; extras?: ActionExtras }) {
  const t = useT();
  const [method, setMethod] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [sentOn, setSentOn] = useState(extras?.today ?? "");
  const [boxCode, setBoxCode] = useState(extras?.currentBox ?? "");
  const [errs, setErrs] = useState<ReleaseErrors>({});
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
  // Esc also closes the panel when focus has fallen back to the page after a click (QA-024). The form's own Esc
  // handler runs first and marks the event handled. Esc meant for another widget (assistant, alerts) is left alone.
  const panel = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || busy) return;
      const a = document.activeElement;
      if (a && a !== document.body && !panel.current?.contains(a)) return;
      e.preventDefault();
      if (confirming) setConfirming(false);
      else {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, confirming, busy]);
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
  const how = t(historyHow(method, courier));
  const summary =
    kind === "forward"
      ? t("Send {no} to {office}?", { no: trackingNo, office: officeLabel ?? t("the office you chose") })
      : kind === "release"
        ? needsTracking(method) && tracking.trim()
          ? t("Send out {no} by {how}, tracking {track}?", { no: trackingNo, how, track: tracking.trim().toUpperCase().replace(/\s+/g, "") })
          : t("Send out {no} by {how}?", { no: trackingNo, how })
        : kind === "archive" && normalizeBoxCode(boxCode)
          ? t("File away {no} in box {code}?", { no: trackingNo, code: normalizeBoxCode(boxCode) })
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
      ref={panel}
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
          if (choice === "forward" && !office) return;
          if (kind === "release") {
            const r = parseReleaseForm({ method, courier, tracking, sentOn }, extras?.today ?? "");
            if (!r.ok) {
              setErrs(r.errors);
              const id = r.errors.method ? "act-method-registered_mail" : r.errors.tracking ? "act-tracking" : "act-sent-on";
              document.getElementById(id)?.focus();
              return;
            }
            setErrs({});
          }
          setConfirming(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (busy) return;
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
      {kind === "release" && (
        <>
          <fieldset aria-describedby={errs.method ? "act-method-err" : undefined}>
            <legend className="label">{t("How was it sent?")}</legend>
            {SEND_METHODS.map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  id={`act-method-${m}`}
                  name="send_method"
                  value={m}
                  checked={method === m}
                  onChange={() => { setMethod(m); setConfirming(false); }}
                />
                {t(METHOD_LABEL[m])}
              </label>
            ))}
            {errs.method && <p id="act-method-err" className="text-sm text-red-700">{t(errs.method)}</p>}
          </fieldset>
          {method === "courier" && (
            <div>
              <label className="label" htmlFor="act-courier">{t("Courier name")}</label>
              <input id="act-courier" name="courier" className="input" list="courier-names" autoComplete="off" value={courier} onChange={(e) => { setCourier(e.target.value); setConfirming(false); }} />
              <datalist id="courier-names">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          )}
          {needsTracking(method) && (
            <div>
              <label className="label" htmlFor="act-tracking">{t("Tracking number")}</label>
              <input
                id="act-tracking"
                name="tracking_no"
                className="input font-mono"
                autoComplete="off"
                value={tracking}
                aria-invalid={errs.tracking ? true : undefined}
                aria-describedby={errs.tracking ? "act-tracking-hint act-tracking-err" : "act-tracking-hint"}
                onChange={(e) => { setTracking(e.target.value); setConfirming(false); }}
              />
              <p id="act-tracking-hint" className="mt-1 text-sm text-slate-600">{t("From the receipt, e.g. RR123456789PH")}</p>
              {errs.tracking && <p id="act-tracking-err" className="text-sm text-red-700">{t(errs.tracking)}</p>}
            </div>
          )}
          <div>
            <label className="label" htmlFor="act-sent-on">{t("Date sent")}</label>
            <input
              id="act-sent-on"
              name="sent_on"
              type="date"
              className="input"
              max={extras?.today}
              value={sentOn}
              aria-invalid={errs.sentOn ? true : undefined}
              aria-describedby={errs.sentOn ? "act-sent-on-err" : undefined}
              onChange={(e) => { setSentOn(e.target.value); setConfirming(false); }}
            />
            {errs.sentOn && <p id="act-sent-on-err" className="text-sm text-red-700">{t(errs.sentOn)}</p>}
          </div>
        </>
      )}
      {kind === "archive" && extras?.boxField && (
        <div>
          <label className="label" htmlFor="act-box">{t("Put the paper in a box (optional)")}</label>
          <input id="act-box" name="box_code" className="input font-mono" list="box-codes" autoComplete="off" aria-describedby="act-box-hint" value={boxCode} onChange={(e) => { setBoxCode(e.target.value); setConfirming(false); }} />
          <p id="act-box-hint" className="mt-1 text-sm text-slate-600">{t("Leave empty if it is not boxed yet.")}</p>
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
          {kind === "archive" && extras?.deliveryOpen && (
            <p className="text-sm text-amber-950">{t("Delivery is not recorded yet. You cannot add it after filing away.")}</p>
          )}
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
      <button className="btn-secondary w-full" disabled={pending || prep.busy || prep.tooBig}>{t(pending ? "Uploading…" : "Attach file")}</button>
    </form>
  );
}

export function AssignForm({ recordId, people, currentId }: { recordId: string; people: { id: string; full_name: string }[]; currentId: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(assignRecord, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <label className="label" htmlFor="as-person">{t("Staff member")}</label>
      <select id="as-person" name="assignee" className="input" required defaultValue={currentId ?? ""}>
        <option value="" disabled>{t("Choose…")}</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <div role="status">
        {state?.error && <p className="text-sm text-red-700">{t(state.error, state.vars)}</p>}
        {!pending && state?.ok && <p className="text-sm text-emerald-700">{t(state.ok, state.vars)}</p>}
      </div>
      <button className="btn-secondary w-full" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Assign")}</button>
    </form>
  );
}

export function DeleteForm({ recordId }: { recordId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(deleteRecord, undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm text-red-700 hover:underline">
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
        <button className="btn bg-red-700 text-white hover:bg-red-800" disabled={pending}>
          {t(pending ? "Deleting…" : "Yes, move to bin")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>
  );
}

export function CopyDecisionForm({ recordId }: { recordId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(decideCopy, undefined);
  const [refusing, setRefusing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (refusing && !confirming) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="decision" value={refusing ? "refuse" : "approve"} />
      {refusing && (
        <div>
          <label className="label" htmlFor="cd-reason">{t("Reason for refusing")}</label>
          <textarea id="cd-reason" name="reason" rows={3} className="input" minLength={5} maxLength={1000} required onChange={() => setConfirming(false)} />
        </div>
      )}
      <div role="status">
        {state?.error && <p className="text-sm text-red-700">{t(state.error)}</p>}
        {!pending && state?.ok && <p className="text-sm text-emerald-700">{t(state.ok)}</p>}
      </div>
      {!refusing ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Approve release (Data Privacy Officer)")}</button>
          <button type="button" className="btn-secondary text-red-700" onClick={() => setRefusing(true)}>{t("Refuse release")}</button>
        </div>
      ) : confirming ? (
        <div tabIndex={-1} className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3" role="alertdialog" aria-label={t("Please confirm")} aria-describedby="cd-confirm-q">
          <p id="cd-confirm-q" className="font-medium text-red-900">{t("Refuse the release? This cannot be undone.")}</p>
          <div className="flex gap-2">
            <button className="btn bg-red-700 text-white hover:bg-red-800 flex-1" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Refuse release")}</button>
            <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => setConfirming(false)}>{t("No, go back")}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className="btn bg-red-700 text-white hover:bg-red-800">{t("Refuse release")}</button>
          <button type="button" className="btn-secondary" onClick={() => { setRefusing(false); setConfirming(false); }}>{t("Cancel")}</button>
        </div>
      )}
    </form>
  );
}

export function CopyReleaseForm({ recordId, idRequired }: { recordId: string; idRequired: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(releaseCopy, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirming) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="record_id" value={recordId} />
      <div>
        <label className="label" htmlFor="cr-name">{t("Name of the person who received it")}</label>
        <input id="cr-name" name="received_by" className="input" minLength={2} maxLength={200} required autoComplete="off" onChange={() => setConfirming(false)} />
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="id_checked" className="checkbox" required={idRequired} />
        <span>{t("I checked their ID")}</span>
      </label>
      <div role="status">
        {state?.error && <p className="text-sm text-red-700">{t(state.error)}</p>}
        {!pending && state?.ok && <p className="text-sm text-emerald-700">{t(state.ok)}</p>}
      </div>
      {confirming ? (
        <div tabIndex={-1} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label={t("Please confirm")} aria-describedby="cr-confirm-q">
          <p id="cr-confirm-q" className="font-medium text-amber-950">{t("Record the release of this copy?")}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Yes, save it")}</button>
            <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => setConfirming(false)}>{t("No, go back")}</button>
          </div>
        </div>
      ) : (
        <button type="submit" className="btn-primary w-full">{t("Record release")}</button>
      )}
    </form>
  );
}
