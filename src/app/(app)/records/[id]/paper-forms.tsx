"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { normalizeBoxCode } from "@/lib/boxes";
import { dayMonth, parseDeliveryForm } from "@/lib/dispatch";
import { moveRecordBox, recordDelivery } from "./actions";

/** Records desk: put the paper copy in a box, move it, or take it out. Asks first, like the Take action panel. */
export function BoxMoveForm({ recordId, trackingNo, currentBox }: { recordId: string; trackingNo: string; currentBox: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(moveRecordBox, undefined);
  const [code, setCode] = useState("");
  const [takeOut, setTakeOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) confirmBox.current?.focus();
  }, [confirming]);
  useEffect(() => {
    setConfirming(false);
  }, [state]);
  const newCode = normalizeBoxCode(code);
  const summary = takeOut
    ? t("Take {no} out of box {code}?", { no: trackingNo, code: currentBox ?? "" })
    : currentBox
      ? t("Move {no} from {a} to {b}?", { no: trackingNo, a: currentBox, b: newCode })
      : t("Put {no} in box {code}?", { no: trackingNo, code: newCode });
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirming) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
      className="mt-2 space-y-3"
    >
      <input type="hidden" name="record_id" value={recordId} />
      <div>
        <label className="label" htmlFor="box-code">{t("Box code")}</label>
        <input
          id="box-code"
          name="box_code"
          className="input font-mono"
          list="box-codes"
          autoComplete="off"
          aria-describedby="box-code-hint"
          required={!takeOut}
          disabled={takeOut}
          value={code}
          onChange={(e) => { setCode(e.target.value); setConfirming(false); }}
        />
        <p id="box-code-hint" className="mt-1 text-sm text-slate-600">{t("Type the code on the box label")}</p>
      </div>
      {currentBox && (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="take_out" checked={takeOut} onChange={(e) => { setTakeOut(e.target.checked); setConfirming(false); }} />
          {t("Take it out of its box")}
        </label>
      )}
      {state?.error && <p className="text-sm text-red-700" role="status">{t(state.error)}</p>}
      {state?.ok && !pending && <p className="text-sm text-emerald-700" role="status">{t(state.ok)}</p>}
      {confirming ? (
        <div ref={confirmBox} tabIndex={-1} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label={t("Please confirm")} aria-describedby="box-confirm-q">
          <p id="box-confirm-q" className="font-medium text-amber-950">{summary}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Yes, save it")}</button>
            <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => setConfirming(false)}>{t("No, go back")}</button>
          </div>
        </div>
      ) : (
        <button type="submit" className="btn-primary w-full">{t("Save")}</button>
      )}
    </form>
  );
}

/** Sending office or records desk: who received the record that was sent out. After saving, the page shows "Delivery saved." */
export function DeliveryForm({ recordId, trackingNo, sentOn, today }: { recordId: string; trackingNo: string; sentOn: string; today: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(recordDelivery, undefined);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [on, setOn] = useState(today);
  const [errs, setErrs] = useState<{ receivedBy?: string; receivedOn?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const confirmBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) confirmBox.current?.focus();
  }, [confirming]);
  useEffect(() => {
    setConfirming(false);
  }, [state]);

  if (!open)
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {t("Record delivery")}
      </button>
    );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirming) return;
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = parseDeliveryForm({ receivedBy: fd.get("received_by"), receivedOn: fd.get("received_on"), note: fd.get("note") }, sentOn, today);
        if (!r.ok) {
          setErrs(r.errors);
          document.getElementById(r.errors.receivedBy ? "deliv-by" : "deliv-on")?.focus();
          return;
        }
        setErrs({});
        setConfirming(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) {
          e.preventDefault();
          if (confirming) setConfirming(false);
          else setOpen(false);
        }
      }}
      className="mt-3 space-y-3"
    >
      <input type="hidden" name="record_id" value={recordId} />
      <div>
        <label className="label" htmlFor="deliv-by">{t("Who received it?")}</label>
        <input
          id="deliv-by"
          name="received_by"
          className="input"
          autoComplete="off"
          required
          value={name}
          aria-invalid={errs.receivedBy ? true : undefined}
          aria-describedby={errs.receivedBy ? "deliv-by-hint deliv-by-err" : "deliv-by-hint"}
          onChange={(e) => { setName(e.target.value); setConfirming(false); }}
        />
        <p id="deliv-by-hint" className="mt-1 text-sm text-slate-600">{t("Name on the receiving copy")}</p>
        {errs.receivedBy && <p id="deliv-by-err" className="text-sm text-red-700">{t(errs.receivedBy)}</p>}
      </div>
      <div>
        <label className="label" htmlFor="deliv-on">{t("Date received")}</label>
        <input
          id="deliv-on"
          name="received_on"
          type="date"
          className="input"
          max={today}
          value={on}
          aria-invalid={errs.receivedOn ? true : undefined}
          aria-describedby={errs.receivedOn ? "deliv-on-err" : undefined}
          onChange={(e) => { setOn(e.target.value); setConfirming(false); }}
        />
        {errs.receivedOn && <p id="deliv-on-err" className="text-sm text-red-700">{t(errs.receivedOn)}</p>}
      </div>
      <div>
        <label className="label" htmlFor="deliv-note">{t("Note (optional)")}</label>
        <textarea id="deliv-note" name="note" rows={3} className="input" />
      </div>
      {state?.error && <p className="text-sm text-red-700" role="alert">{t(state.error)}</p>}
      {confirming ? (
        <div ref={confirmBox} tabIndex={-1} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label={t("Please confirm")} aria-describedby="deliv-confirm-q">
          <p id="deliv-confirm-q" className="font-medium text-amber-950">
            {t("Record delivery for {no}: received by {name} on {date}?", { no: trackingNo, name: name.trim(), date: `${dayMonth(on)}, ${on.slice(0, 4)}` })}
          </p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Yes, save it")}</button>
            <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => setConfirming(false)}>{t("No, go back")}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">{t("Save")}</button>
          <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>{t("Cancel")}</button>
        </div>
      )}
    </form>
  );
}
