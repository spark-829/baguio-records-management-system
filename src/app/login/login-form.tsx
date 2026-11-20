"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input key={state?.email ?? "default"} className="input" id="email" name="email" type="email" autoComplete="username" defaultValue={state?.email ?? "records@rms-demo.test"} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <summary className="cursor-pointer font-medium text-slate-800">Privacy notice (Data Privacy Act of 2012)</summary>
        <div className="mt-2 space-y-1.5">
          <p>
            This system holds personal information of citizens and employees found in official records. It is processed only
            to register, route, act on and keep public records, as allowed by Republic Act No. 10173 and records laws.
          </p>
          <p>
            Every sign-in, record you open and file you download is logged with your name, date, time and IP address.
            Use the records only for your official work. Do not copy, share or disclose them outside the office.
          </p>
          <p>Questions or requests about personal data go to the City&apos;s Data Protection Officer.</p>
        </div>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input key={state?.email ?? "default"} type="checkbox" name="privacy" className="mt-0.5" defaultChecked={Boolean(state?.email)} required />
        <span>I have read the privacy notice and will use records for official work only.</span>
      </label>
      {state?.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
