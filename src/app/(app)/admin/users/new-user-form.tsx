"use client";

import { useT } from "@/lib/i18n/client";

import { useActionState } from "react";
import { createUser } from "./actions";

export function NewUserForm({ offices }: { offices: { id: string; code: string; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label" htmlFor="nu-full_name">{t("Full name")}</label><input name="full_name" id="nu-full_name" className="input" required /></div>
      <div><label className="label" htmlFor="nu-email">{t("Email")}</label><input name="email" id="nu-email" type="email" className="input" required pattern=".+@rms-demo\.test" placeholder="name@rms-demo.test" aria-describedby="nu-email-hint" />
        <p id="nu-email-hint" className="mt-1 text-sm text-slate-600">{t("In this demo, new accounts must use an @rms-demo.test email.")}</p>
      </div>
      <div><label className="label" htmlFor="nu-password">{t("Temporary password")}</label><input name="password" id="nu-password" type="text" minLength={8} className="input" required /></div>
      <div>
        <label className="label" htmlFor="nu-role">{t("Role")}</label>
        <select name="role" id="nu-role" className="input" defaultValue="staff">
          <option value="staff">{t("Department Staff")}</option>
          <option value="dept_head">{t("Department Head")}</option>
          <option value="records_officer">{t("Records Officer")}</option>
          <option value="admin">{t("Administrator")}</option>
          <option value="viewer">{t("Viewer (read-only)")}</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="nu-office_id">{t("Office")}</label>
        <select name="office_id" id="nu-office_id" className="input" required>
          <option value="">{t("Choose…")}</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-700">{t(state.error)}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t(pending ? "Creating…" : "Create account")}</button>
    </form>
  );
}
