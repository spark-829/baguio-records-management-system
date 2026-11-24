import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";
import { BrandLockup, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";

const DEMO = [
  { email: "records@rms-demo.test", role: "Records Officer (City General Services Office)" },
  { email: "admin@rms-demo.test", role: "Administrator" },
  { email: "engineering.head@rms-demo.test", role: "Department Head, Engineering" },
  { email: "engineering.staff@rms-demo.test", role: "Staff, Engineering" },
  { email: "treasury.staff@rms-demo.test", role: "Staff, Treasury" },
  { email: "viewer@rms-demo.test", role: "Viewer, Planning (read-only)" },
];

const NOTICES: Record<string, string> = {
  "no-access": "This account has no active RMS profile. Ask an administrator for access.",
  locked: "This account is locked. Try again later or ask an administrator to unlock it.",
  idle: "You were signed out because the computer was not used for a while. This keeps records safe. Please sign in again.",
  "signed-out": "You have signed out safely.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { t } = await getT();
  const { error, next } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="on-dark border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:py-3">
          <BrandLockup />
          <div className="ml-auto"><LangToggle dark /></div>
        </div>
      </header>
      <main id="main" className="flex-1 bg-page px-4 py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-5xl items-start gap-8 md:grid-cols-2">
          <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold">{t("Sign in")}</h1>
            {error && NOTICES[error] && (
              <p role="status" className={`mt-3 rounded-lg border p-3 text-sm ${error === "signed-out" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{t(NOTICES[error])}</p>
            )}
            <LoginForm next={safeNextPath(next) ?? ""} />
          </div>
          <div>
            <p className="text-lg text-slate-700">{t("Register incoming and outgoing documents, route them between offices, see where each one is, and find it again in seconds.")}</p>
            <div className="card mt-6 p-5">
              <h2 className="text-lg font-bold">{t("Demo accounts (password: Demo@2026)")}</h2>
              <dl className="mt-3 space-y-3">
                {DEMO.map((d) => (
                  <div key={d.email}>
                    <dt className="font-mono text-sm break-words text-ink">{d.email}</dt>
                    <dd className="text-sm text-slate-600">{t(d.role)}</dd>
                  </div>
                ))}
              </dl>
            </div>
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
