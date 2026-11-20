"use client";

import { useActionState, useState } from "react";
import { ACTIONS, type ActionKind } from "@/lib/workflow";
import { addAttachment, deleteRecord, recordAction } from "./actions";

type Office = { id: string; code: string; name: string };

/**
 * The "Take action" panel. It stays closed until the person asks for it, so nothing is saved by a stray click,
 * and every save shows a plain "Are you sure?" step first.
 */
export function ActionForm({ recordId, trackingNo, actions, offices, returnTo }: { recordId: string; trackingNo: string; actions: ActionKind[]; offices: Office[]; returnTo?: Office | null }) {
  const [state, action, pending] = useActionState(recordAction, undefined);
  const canReturn = Boolean(returnTo && actions.includes("forward") && offices.some((o) => o.id === returnTo.id));
  const choices: { value: string; label: string }[] = [
    ...(canReturn ? [{ value: "return", label: `Send back to ${returnTo!.name}` }] : []),
    ...actions.map((a) => ({ value: a, label: ACTIONS[a].label })),
  ];
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(choices[0].value);
  const [office, setOffice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const kind: ActionKind = choice === "return" ? "forward" : (choice as ActionKind);
  const toOffice = choice === "return" ? returnTo!.id : office;
  const officeLabel = offices.find((o) => o.id === toOffice)?.name;
  const summary =
    kind === "forward"
      ? `Send ${trackingNo} to ${officeLabel ?? "the office you chose"}?`
      : `${ACTIONS[kind].label} for ${trackingNo}?`;

  if (!open)
    return (
      <div className="space-y-2">
        {pending && <p className="text-sm text-slate-700" role="status">Saving…</p>}
        {!pending && state?.ok && <p className="text-sm text-emerald-700" role="status">{state.ok}</p>}
        {!pending && state?.error && <p className="text-sm text-red-700" role="alert">Not saved: {state.error}</p>}
        <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>
          Add a note or send to another office
        </button>
      </div>
    );

  return (
    <form
      action={(fd) => {
        setConfirming(false);
        setOpen(false);
        return action(fd);
      }}
      className="space-y-3"
      key={actions.join()}
    >
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "forward" && <input type="hidden" name="to_office_id" value={toOffice} />}
      <div>
        <label className="label" htmlFor="act-kind">What do you want to do?</label>
        <select id="act-kind" className="input" value={choice} onChange={(e) => { setChoice(e.target.value); setConfirming(false); }}>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {choice === "forward" && (
        <div>
          <label className="label" htmlFor="act-office">Send to which office?</label>
          <select id="act-office" className="input" value={office} onChange={(e) => { setOffice(e.target.value); setConfirming(false); }} required>
            <option value="">Choose an office…</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="act-taken">What was done? (optional)</label>
        <input id="act-taken" name="action_taken" className="input" placeholder="e.g. Site inspected, voucher signed" />
      </div>
      <div>
        <label className="label" htmlFor="act-remarks">Note for the next office (optional)</label>
        <textarea id="act-remarks" name="remarks" rows={3} className="input" placeholder="e.g. Please inspect within 3 working days" />
      </div>
      {state?.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      {confirming ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label="Please confirm">
          <p className="font-medium text-amber-950">{summary}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : "Yes, save it"}</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setConfirming(false)}>No, go back</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={choice === "forward" && !office}
            onClick={() => setConfirming(true)}
          >
            Save
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={() => { setOpen(false); setConfirming(false); }}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

export function AttachForm({ recordId }: { recordId: string }) {
  const [state, action, pending] = useActionState(addAttachment, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <label className="label" htmlFor="attach-file">Add a scanned file (PDF or photo)</label>
      <input id="attach-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="file-input" required />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-secondary w-full" disabled={pending}>{pending ? "Uploading…" : "Attach file"}</button>
    </form>
  );
}

export function DeleteForm({ recordId }: { recordId: string }) {
  const [state, action, pending] = useActionState(deleteRecord, undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 hover:underline">
        Delete this record…
      </button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <label className="label" htmlFor="reason">Reason for deleting</label>
      <input id="reason" name="reason" className="input" placeholder="e.g. Duplicate of IN-2026-0004" minLength={5} required />
      <p className="text-xs text-slate-500">The record moves to the deleted-records bin. Only an administrator can restore it. This is logged.</p>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800" disabled={pending}>
          {pending ? "Deleting…" : "Yes, move to bin"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
