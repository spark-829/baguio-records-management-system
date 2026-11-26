"use client";

import { wipeAllChats } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";

import { Fragment, useActionState, useEffect, useState, type KeyboardEvent } from "react";
import { signIn } from "./actions";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";

export function LoginForm({ next = "", email = "" }: { next?: string; email?: string }) {
  const t = useT();
  useEffect(() => {
    wipeAllChats();
  }, []);
  const [state, action, pending] = useActionState(signIn, undefined);
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  // Caps Lock warning, as on Windows and macOS sign-in: read the key state on every key in the password box.
  const readCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") setCaps(e.getModifierState("CapsLock"));
  };
  return (
    <form id="login-form" action={action} className="mt-5 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">{t("Email")}</label>
        <input key={state?.email ?? (email || "default")} className="input" id="email" name="email" type="email" autoComplete="username" defaultValue={state?.email ?? email} placeholder="e.g. records@rms-demo.test" required />
      </div>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <label className="label" htmlFor="password">{t("Password")}</label>
          <a href="/login/forgot" className="tap-link text-sm font-semibold text-brand-700 underline">{t("Forgot password?")}</a>
        </div>
        <div className="relative">
          <input
            className="input pr-24"
            id="password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            defaultValue={email ? DEMO_PASSWORD : undefined}
            aria-describedby={caps ? "caps-warning" : undefined}
            onKeyDown={readCaps}
            onKeyUp={readCaps}
            onBlur={() => setCaps(false)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-controls="password"
            aria-pressed={showPw}
            className="absolute inset-y-0 right-0 min-h-11 min-w-20 rounded-r-lg px-3 text-sm font-semibold text-brand-800 underline underline-offset-2 hover:bg-brand-50"
          >
            {showPw ? t("Hide") : t("Show")}
            <span className="sr-only"> {t("password")}</span>
          </button>
        </div>
        <p id="caps-warning" role="status" className={caps ? "mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" : "sr-only"}>
          {caps ? t("Caps Lock is on. Passwords are case-sensitive.") : ""}
        </p>
      </div>
      <p className="text-sm text-slate-700">
        {t("Every sign-in, record you open and file you download is logged with your name, date, time and IP address.")}
      </p>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-base">
        <input
          key={state?.email ?? "default"}
          type="checkbox"
          name="privacy"
          className="checkbox mt-1"
          autoFocus={Boolean(email) && !state}
          defaultChecked={Boolean(state?.email)}
          required
          aria-describedby="agree-hint"
          onInvalid={(e) => e.currentTarget.setCustomValidity(t("Please read and agree to the Terms of use and the Privacy notice before signing in."))}
          onChange={(e) => e.currentTarget.setCustomValidity("")}
        />
        <span>
          <AgreeText text={t("I have read and agree to the {terms} and the {privacy}, and I will use records for official work only.")} terms={t("Terms of use")} privacy={t("Privacy notice")} />
        </span>
      </label>
      <p id="agree-hint" className="-mt-3 pl-8 text-sm text-slate-600">{t("The links open in a new tab, so what you typed stays here.")}</p>
      {state?.error && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900" role="alert">{t(state.error)}</p>}
      <button className="btn-primary min-h-12 w-full text-lg" disabled={pending}>{t(pending ? "Signing in…" : "Sign in")}</button>
    </form>
  );
}

/** The agreement sentence with {terms} and {privacy} turned into links (one sentence, so it translates whole). */
function AgreeText({ text, terms, privacy }: { text: string; terms: string; privacy: string }) {
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener" className="inline-block min-h-6 font-semibold text-brand-700 underline underline-offset-2">{label}</a>
  );
  return (
    <>
      {text.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
        part === "{terms}" ? <Fragment key={i}>{link("/terms", terms)}</Fragment> : part === "{privacy}" ? <Fragment key={i}>{link("/privacy", privacy)}</Fragment> : part,
      )}
    </>
  );
}
