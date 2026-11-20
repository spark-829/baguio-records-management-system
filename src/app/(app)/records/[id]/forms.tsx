"use client";

import { useActionState, useState } from "react";
import { ACTIONS, type ActionKind } from "@/lib/workflow";
import { addAttachment, deleteRecord, recordAction } from "./actions";

export function ActionForm({ recordId, actions, offices }: { recordId: string; actions: ActionKind[]; offices: { id: string; code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(recordAction, undefined);
  const [kind, setKind] = useState<ActionKind>(actions[0]);
  return (
    <form action={action} className="space-y-3" key={actions.join()}>
      <input type="hidden" name="record_id" value={recordId} />
      <div>
        <label className="label">Action</label>
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
          {actions.map((a) => <option key={a} value={a}>{ACTIONS[a].label}</option>)}
        </select>
      </div>
      {ACTIONS[kind].needsOffice && (
        <div>
          <label className="label">Forward to</label>
          <select name="to_office_id" className="input" required>
            <option value="">Choose office…</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">Action taken</label>
        <input name="action_taken" className="input" placeholder={ACTIONS[kind].label} />
      </div>
      <div>
        <label className="label">Remarks</label>
        <textarea name="remarks" rows={3} className="input" placeholder="Notes for the next office" />
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function AttachForm({ recordId }: { recordId: string }) {
  const [state, action, pending] = useActionState(addAttachment, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="record_id" value={recordId} />
      <input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm" required />
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
          {pending ? "Deleting…" : "Move to bin"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
