import { getT, pageTitle } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";
import { SiteFooter } from "@/components/brand";
import { PublicHeader } from "@/components/public-header";
import { DEMO_START, demoEmailParam, demoHref } from "@/lib/demo-accounts";
import { AllAccounts } from "./all-accounts";
import { TryAs } from "./try-as";
import { StatusLine } from "./status-line";
import { LEGAL_VARS } from "@/lib/legal";


const NOTICES: Record<string, string> = {
  "no-access": "This account has no active RMS profile. Ask an administrator for access.",
  locked: "This account is locked. Try again later or ask an administrator to unlock it.",
  idle: "You were signed out because the computer was not used for a while. This keeps records safe. Please sign in again.",
  "signed-out": "You have signed out safely.",
  expired: "Your sign-in has ended. Please sign in again.",
};

export const generateMetadata = pageTitle("Sign in");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; email?: string }> }) {
  const { t } = await getT();
  const { error, next, email } = await searchParams;
  const nextPath = safeNextPath(next) ?? "";
  const prefill = demoEmailParam(email);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <PublicHeader developer />
      <main id="main" className="flex-1 bg-page px-4 py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-5xl items-start gap-8 md:grid-cols-2">
          <div className="space-y-8">
          <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold">{t("Sign in")}</h1>
            {error && NOTICES[error] && (
              <p role="status" className={`mt-3 rounded-lg border p-3 text-sm ${error === "signed-out" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{t(NOTICES[error])}</p>
            )}
            <LoginForm next={nextPath} email={prefill} />
          </div>
          <section id="help" aria-labelledby="help-h" className="card scroll-mt-4 border-brand-600 bg-brand-50 p-5">
            <h2 id="help-h" className="text-lg font-bold">{t("Need help signing in?")}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-6">
              <li>
                {t("Forgot your password, or is your account locked? Contact the administrator of the system for support.")}{" "}
                <a href="/login/forgot" className="font-semibold text-brand-700 underline">{t("Ask for password help")}</a>
              </li>
              <li>{t("New staff member? Ask the administrator to make your own account. Accounts are never shared.")}</li>
              <li>{t("After {n} wrong passwords the account locks for {m} minutes. Wait, or ask the administrator to unlock it.", { n: LEGAL_VARS.tries, m: LEGAL_VARS.lockMinutes })}</li>
              <li>
                {t("Filed a document and want to know where it is? You do not need an account.")}{" "}
                <a href="/track" className="font-semibold text-brand-700 underline">{t("Track your document")}</a>
              </li>
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-5">
              <a href="/terms" className="tap-link font-semibold text-brand-700 underline">{t("Terms of use")}</a>
              <a href="/privacy" className="tap-link font-semibold text-brand-700 underline">{t("Privacy notice")}</a>
            </p>
            <StatusLine />
          </section>
          </div>
          <div>
            <p className="text-lg text-slate-700">{t("Register incoming and outgoing documents, route them between offices, see where each one is, and find it again in seconds.")}</p>
            {/* The demo account list is for this portfolio demo only; RMS_PRODUCTION=1 hides it (QA-102). */}
            {process.env.RMS_PRODUCTION !== "1" && (
            <section className="card mt-6 p-5" aria-labelledby="demo-accounts">
              <h2 id="demo-accounts" className="text-lg font-bold">{t("Demo accounts (password: Demo@2026)")}</h2>
              <div className="mt-4"><TryAs /></div>
              <h3 className="mt-5 font-semibold text-ink">{t("Good places to start")}</h3>
              <p className="text-sm text-slate-600">{t("Choose an email to fill in the sign-in form.")}</p>
              <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                {DEMO_START.map((d) => (
                  <li key={d.email} className="py-2.5">
                    <a href={demoHref(d.email, nextPath)} className="font-mono text-sm break-words text-brand-700 underline underline-offset-2">{d.email}</a>
                    <p className="text-sm text-slate-600">{t(d.role)}</p>
                  </li>
                ))}
              </ul>
              <AllAccounts next={nextPath} />
            </section>
            )}
            <p className="mt-4 text-sm text-slate-600">
              {t("Portfolio demo built by")}{" "}
              <a href="/developer" className="font-semibold text-brand-700 underline">Vicson Yaris</a>.{" "}
              {t("Not an official City Government system; all data is fictional.")}
            </p>
          </div>
        </div>
      </main>
      <SiteFooter className="" />
    </div>
  );
}
