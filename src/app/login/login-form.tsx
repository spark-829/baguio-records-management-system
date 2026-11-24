"use client";

import { wipeAllChats } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";

import { useActionState, useEffect } from "react";
import { signIn } from "./actions";

export function LoginForm({ next = "" }: { next?: string }) {
  const t = useT();
  useEffect(() => {
    wipeAllChats();
  }, []);
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="mt-5 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">{t("Email")}</label>
        <input key={state?.email ?? "default"} className="input" id="email" name="email" type="email" autoComplete="username" defaultValue={state?.email ?? ""} placeholder="e.g. records@rms-demo.test" required />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("Password")}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <details open className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-brand-800">{t("Privacy notice (Data Privacy Act of 2012)")}</summary>
        <div className="mt-2 space-y-2 pb-2">
          <p>
            {t("This system holds personal information of citizens and employees found in official records. It is processed only to register, route, act on and keep public records, as allowed by Republic Act No. 10173 and records laws.")}
          </p>
          <p>
            {t("Every sign-in, record you open and file you download is logged with your name, date, time and IP address. Use the records only for your official work. Do not copy, share or disclose them outside the office.")}
          </p>
          <p>{t("Questions or requests about personal data go to the City's Data Protection Officer.")}</p>
        </div>
      </details>
      <label className="flex cursor-pointer items-start gap-3 text-base">
        <input
          key={state?.email ?? "default"}
          type="checkbox"
          name="privacy"
          className="checkbox mt-1"
          defaultChecked={Boolean(state?.email)}
          required
          onInvalid={(e) => e.currentTarget.setCustomValidity(t("Please tick this box to agree before signing in."))}
          onChange={(e) => e.currentTarget.setCustomValidity("")}
        />
        <span>{t("I have read the privacy notice and will use records for official work only.")}</span>
      </label>
      {state?.error && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900" role="alert">{t(state.error)}</p>}
      <button className="btn-primary min-h-12 w-full text-lg" disabled={pending}>{t(pending ? "Signing in…" : "Sign in")}</button>
    </form>
  );
}
