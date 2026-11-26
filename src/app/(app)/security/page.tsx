import { getT, pageTitle } from "@/lib/i18n/server";
import { Rich } from "@/components/rich";
import { getProfile, getSettings } from "@/lib/session";
import { MfaSetup } from "./mfa-setup";

export const generateMetadata = pageTitle("My account");

export default async function SecurityPage() {
  const { t } = await getT();
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t("My account")}</h1>
      <p className="text-slate-700">
        <Rich text={t("Signed in as **{name}**. Nothing on this page is required unless your administrator asks you to.", { name: me.full_name })} />
      </p>
      <section className="card p-4">
        <h2 className="font-semibold">{t("Two-step sign-in (authenticator app)")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t(me.role === "admin"
            ? "Recommended for administrators. Once it is on, admin tools only work after you enter a code from your phone. This is enforced by the database, not just the screen."
            : "Optional. After your password, you also type a 6-digit code shown on your phone. You need an app such as Google Authenticator. Ask the IT staff if you want help setting it up.")}
        </p>
        <MfaSetup />
      </section>
      <section className="card p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">{t("Sign-in protection")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t("After {a} wrong passwords the account locks for {b} minutes.", { a: settings.lockoutThreshold, b: settings.lockoutMinutes })}</li>
          <li>{t("You are signed out after {n} minutes without activity.", { n: settings.idleTimeoutMinutes })}</li>
          <li>{t("Every sign-in, record opened and file downloaded is logged with the time and the computer it came from (IP address).")}</li>
        </ul>
      </section>
    </div>
  );
}
