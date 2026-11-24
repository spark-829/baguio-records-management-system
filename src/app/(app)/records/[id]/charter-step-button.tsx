"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { markCharterStep } from "./actions";

/** "Mark step n done" (or "Undo"). The database re-checks who may do it. */
export function CharterStepButton({ recordId, step, undo }: { recordId: string; step: number; undo?: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(markCharterStep, undefined);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="step" value={step} />
      {undo && <input type="hidden" name="undo" value="1" />}
      <button className="btn-secondary w-full sm:w-auto" disabled={pending}>
        {pending ? t("Saving…") : undo ? t("Undo") : t("Mark step {n} done", { n: step })}
      </button>
      {state?.error && <p role="alert" className="text-sm text-red-700">{t(state.error)}</p>}
      {!pending && state?.ok && <p role="status" className="text-sm text-emerald-700">{t(state.ok, state.vars)}</p>}
    </form>
  );
}
