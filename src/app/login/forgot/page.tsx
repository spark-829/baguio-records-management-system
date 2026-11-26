import { getT, pageTitle } from "@/lib/i18n/server";
import { SiteFooter } from "@/components/brand";
import { PublicHeader } from "@/components/public-header";
import { demoEmailParam } from "@/lib/demo-accounts";
import { requestPasswordHelp } from "./actions";

export const generateMetadata = pageTitle("Forgot password");

/**
 * "Forgot password?" for a staff system (like Microsoft 365 work accounts): there is no self-service reset,
 * so the request goes to the administrator, who checks who is asking before helping. Server form, no client JS.
 */
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string; email?: string }> }) {
  const { t } = await getT();
  const { sent, email } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <PublicHeader width="max-w-3xl" />
      <main id="main" className="flex-1 bg-page px-4 py-8 sm:py-12">
        <div className="card mx-auto w-full max-w-lg p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{t("Forgot your password?")}</h1>
          {sent ? (
            <>
              <p role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                {t("Thank you. If this email belongs to an account, the administrator has been told and will help you through your office. They will never ask for your old password.")}
              </p>
              <p className="mt-4">{t("If it is urgent, ask your office head to contact the administrator.")}</p>
            </>
          ) : (
            <>
              <p className="mt-3">
                {t("Only the administrator can set a new password. Type the email you sign in with and we will send them a request. The request is recorded with the time and network address.")}
              </p>
              <form action={requestPasswordHelp} className="mt-5 space-y-5">
                <div>
                  <label className="label" htmlFor="email">{t("Email")}</label>
                  <input className="input" id="email" name="email" type="email" autoComplete="username" maxLength={254} defaultValue={demoEmailParam(email)} required />
                </div>
                <button className="btn-primary min-h-12 w-full text-lg">{t("Send request to the administrator")}</button>
              </form>
            </>
          )}
          <p className="mt-6">
            <a href="/login" className="tap-link font-semibold text-brand-700 underline">← {t("Back to sign in")}</a>
          </p>
        </div>
      </main>
      <SiteFooter className="" />
    </div>
  );
}
