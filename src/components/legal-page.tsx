import { getT, getLang } from "@/lib/i18n/server";
import { dateLocale } from "@/lib/i18n/core";
import { SiteFooter } from "@/components/brand";
import { PublicHeader } from "@/components/public-header";
import { LEGAL_DPO, LEGAL_UPDATED, LEGAL_VARS, type LegalDoc } from "@/lib/legal";

/** Public Terms of use and Privacy notice pages: static text, no database calls (light on the Workers CPU limit). */
export async function LegalPage({ doc, other }: { doc: LegalDoc; other: { href: string; label: string } }) {
  const [{ t }, lang] = await Promise.all([getT(), getLang()]);
  const vars = { ...LEGAL_VARS, dpo: LEGAL_DPO };
  const updated = new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date(`${LEGAL_UPDATED}T12:00:00+08:00`));
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <PublicHeader width="max-w-3xl" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 text-[1.0625rem] leading-relaxed sm:py-8">
        <p>
          <a href="/login" className="tap-link font-semibold text-brand-700 underline">← {t("Back to sign in")}</a>
        </p>
        <h1 className="mt-3 text-2xl font-bold">{t(doc.title)}</h1>
        <p className="text-sm text-slate-600">{t("Last updated {date}", { date: updated })}</p>
        <div className="mt-3 space-y-2 text-slate-700">
          {doc.intro.map((p) => <p key={p}>{t(p, vars)}</p>)}
        </div>
        <nav aria-label={t("On this page")} className="card mt-5 p-4">
          <h2 className="text-base font-semibold">{t("On this page")}</h2>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="tap-link text-brand-700 underline">{t(s.heading)}</a></li>
            ))}
          </ul>
        </nav>
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-6 scroll-mt-4">
            <h2 id={`${s.id}-h`} className="text-xl font-semibold">{t(s.heading)}</h2>
            <div className="mt-2 space-y-2">
              {s.paras.map((p) => <p key={p}>{t(p, vars)}</p>)}
            </div>
            {s.list && (
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                {s.list.map((p) => <li key={p}>{t(p, vars)}</li>)}
              </ul>
            )}
          </section>
        ))}
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-300 pt-4">
          <a href={other.href} className="tap-link font-semibold text-brand-700 underline">{t(other.label)}</a>
          <a href="/login" className="tap-link font-semibold text-brand-700 underline">{t("Back to sign in")}</a>
        </p>
      </main>
      <SiteFooter className="" />
    </div>
  );
}
