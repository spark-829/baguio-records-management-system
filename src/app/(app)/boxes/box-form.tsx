"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import type { BoxInput } from "@/lib/boxes";
import { saveBox } from "./actions";

type Office = { id: string; code: string; name: string };

/** Add or change a box. Errors show in a summary at the top and next to each field. */
export function BoxForm({ initial, offices, rooms, boxId, cancelHref }: { initial: BoxInput; offices: Office[]; rooms: string[]; boxId?: string; cancelHref: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveBox, undefined);
  const summary = useRef<HTMLDivElement>(null);
  const errors = state?.errors ?? {};
  const list = (
    [["code", "bx-code"], ["office", "bx-office"], ["room", "bx-room"], ["years", "bx-year-from"]] as const
  ).filter(([k]) => errors[k]);
  useEffect(() => {
    if (list.length || state?.error) summary.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const v = (k: keyof BoxInput) => state?.values?.[k] ?? initial[k];
  const msg = (k: keyof typeof errors) => (errors[k] ? t(errors[k]!, state?.vars) : "");

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-5" noValidate>
      {boxId && <input type="hidden" name="box_id" value={boxId} />}
      {(list.length > 0 || state?.error) && (
        <div ref={summary} role="alert" tabIndex={-1} className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">{t("Please fix the following:")}</p>
          <ul className="mt-1 list-disc pl-5">
            {list.map(([k, id]) => (
              <li key={k}><a href={`#${id}`} className="underline">{msg(k)}</a></li>
            ))}
            {state?.error && <li>{t(state.error)}</li>}
          </ul>
        </div>
      )}
      <div>
        <label className="label" htmlFor="bx-code">{t("Box code")}</label>
        <input id="bx-code" name="code" className="input font-mono" autoComplete="off" defaultValue={v("code")} aria-invalid={errors.code ? true : undefined} aria-describedby={errors.code ? "bx-code-hint bx-code-err" : "bx-code-hint"} />
        <p id="bx-code-hint" className="mt-1 text-sm text-slate-600">{t("Write this same code on the box, or print the label.")}</p>
        {errors.code && <p id="bx-code-err" className="text-sm text-red-700">{msg("code")}</p>}
      </div>
      <div>
        <label className="label" htmlFor="bx-office">{t("Which office owns the records?")}</label>
        <select id="bx-office" name="office_id" className="input" defaultValue={v("office_id")} aria-invalid={errors.office ? true : undefined} aria-describedby={errors.office ? "bx-office-err" : undefined}>
          <option value="">{t("Choose an office…")}</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {errors.office && <p id="bx-office-err" className="text-sm text-red-700">{msg("office")}</p>}
      </div>
      <div>
        <label className="label" htmlFor="bx-room">{t("Room")}</label>
        <input id="bx-room" name="room" className="input" list="room-names" autoComplete="off" defaultValue={v("room")} aria-invalid={errors.room ? true : undefined} aria-describedby={errors.room ? "bx-room-hint bx-room-err" : "bx-room-hint"} />
        <datalist id="room-names">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
        <p id="bx-room-hint" className="mt-1 text-sm text-slate-600">{t("e.g. Records room B")}</p>
        {errors.room && <p id="bx-room-err" className="text-sm text-red-700">{msg("room")}</p>}
      </div>
      <div>
        <label className="label" htmlFor="bx-shelf">{t("Shelf")}</label>
        <input id="bx-shelf" name="shelf" className="input" autoComplete="off" defaultValue={v("shelf")} aria-describedby="bx-shelf-hint" />
        <p id="bx-shelf-hint" className="mt-1 text-sm text-slate-600">{t("e.g. Shelf 4, or Rack 2 Shelf 4")}</p>
      </div>
      <div>
        <label className="label" htmlFor="bx-contents">{t("What is inside")}</label>
        <textarea id="bx-contents" name="contents" rows={3} className="input" defaultValue={v("contents")} aria-describedby="bx-contents-hint" />
        <p id="bx-contents-hint" className="mt-1 text-sm text-slate-600">{t("Kind of records, e.g. Purchase requests and canvass sheets. Do not type personal details.")}</p>
      </div>
      <fieldset aria-describedby={errors.years ? "bx-years-err" : undefined}>
        <legend className="label">{t("Years covered")}</legend>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label" htmlFor="bx-year-from">{t("From|year")}</label>
            <input id="bx-year-from" name="year_from" className="input w-28" inputMode="numeric" autoComplete="off" defaultValue={v("year_from")} aria-invalid={errors.years ? true : undefined} />
          </div>
          <div>
            <label className="label" htmlFor="bx-year-to">{t("To|year")}</label>
            <input id="bx-year-to" name="year_to" className="input w-28" inputMode="numeric" autoComplete="off" defaultValue={v("year_to")} aria-invalid={errors.years ? true : undefined} />
          </div>
        </div>
        {errors.years && <p id="bx-years-err" className="text-sm text-red-700">{msg("years")}</p>}
      </fieldset>
      <div>
        <label className="label" htmlFor="bx-notes">{t("Notes (optional)")}</label>
        <textarea id="bx-notes" name="notes" rows={3} className="input" defaultValue={v("notes")} />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} aria-busy={pending}>{t(pending ? "Saving…" : "Save box")}</button>
        <Link href={cancelHref} className="btn-secondary">{t("Cancel")}</Link>
      </div>
    </form>
  );
}
