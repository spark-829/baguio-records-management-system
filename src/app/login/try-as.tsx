"use client";

import { useT } from "@/lib/i18n/client";
import { DEMO_PASSWORD, DEMO_START } from "@/lib/demo-accounts";

/**
 * One-click "Try as" buttons for the demo (like Stripe and Linear demo logins): fill in the email and password
 * and sign in. The agreement box is never ticked for the person: if it is empty, the browser asks for it first.
 */
export function TryAs() {
  const t = useT();
  const tryAs = (email: string) => {
    const form = document.getElementById("login-form") as HTMLFormElement | null;
    const mail = document.getElementById("email") as HTMLInputElement | null;
    const pw = document.getElementById("password") as HTMLInputElement | null;
    if (!form || !mail || !pw) return;
    mail.value = email;
    pw.value = DEMO_PASSWORD;
    form.requestSubmit();
  };
  return (
    <div>
      <h3 className="font-semibold text-ink">{t("Try it in one click")}</h3>
      <p className="text-sm text-slate-600">{t("Signs in as that role. Tick the agreement box first if it asks.")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {DEMO_START.map((d) => (
          <button key={d.email} type="button" onClick={() => tryAs(d.email)} className="btn-secondary min-h-11 justify-center px-3 text-sm">
            {t("Try as {role}", { role: t(d.short ?? d.role) })}
          </button>
        ))}
      </div>
    </div>
  );
}
