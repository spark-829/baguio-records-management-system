import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { BrandLockup, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { ITEMS, SCALE } from "@/lib/satisfaction";
import { submitSurvey } from "./actions";

export const metadata = { title: "Client Satisfaction Survey" };

type Check = { error: "not_found" | "too_many" } | { tracking_no: string; answered: boolean };

/** Public, anonymous, server-rendered (no client JS). The tracking number and code come from the receipt QR. */
export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ no?: string; code?: string; sent?: string; err?: string }> }) {
  const { t } = await getT();
  const { no = "", code = "", sent, err } = await searchParams;
  const nr = no.slice(0, 20);
  const cr = code.slice(0, 12);
  let result: Check | null = null;
  if (nr && cr) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rms_survey_check", { p_tracking: nr, p_code: cr });
    result = error ? { error: "not_found" } : (data as Check);
  }
  const bad = !result || "error" in result ? (result && "error" in result ? result.error : err === "too_many" || err === "not_found" ? err : null) : null;
  const answered = sent !== "1" && ((result && "answered" in result && result.answered) || err === "already");
  const form = result && "tracking_no" in result && !answered && sent !== "1";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="on-dark border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:py-3">
          <BrandLockup />
          <div className="ml-auto"><LangToggle dark /></div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold">{t("Client Satisfaction Survey")}</h1>
        {bad && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
            {t(bad === "too_many"
              ? "Too many tries. Please wait 15 minutes, or ask at the Records Section in City Hall."
              : "We could not find a document with that number and code. Check both against your receipt and try again.")}
          </p>
        )}
        {!bad && !result && (
          <p className="text-lg">{t("Scan the survey code on your receipt, or open the link on it.")}</p>
        )}
        {!bad && answered && <p role="status" className="rounded-lg border border-line bg-slate-50 px-4 py-3 text-lg">{t("We already have your answers for this document.")}</p>}
        {!bad && !answered && sent === "1" && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-lg text-emerald-900">{t("Thank you. Your answers were sent.")}</p>}
        {!bad && form && (
          <>
            <p className="text-lg">{t("Tell us how we handled your document. You do not need to give your name.")}</p>
            <form action={submitSurvey} className="space-y-5">
              <input type="hidden" name="no" value={nr} />
              <input type="hidden" name="code" value={cr} />
              {ITEMS.map((it, i) => (
                <fieldset key={it.key} className="card p-5" aria-describedby={i === 0 && err === "choose" ? "choose-err" : undefined}>
                  <legend className="px-1 text-lg font-semibold">{t(it.label)}{i === 0 && <span aria-hidden="true" className="text-red-700"> *</span>}</legend>
                  {i === 0 && err === "choose" && <p id="choose-err" role="alert" className="font-semibold text-red-700">{t("Choose an answer.")}</p>}
                  <div className="mt-1 flex flex-col">
                    {SCALE.map((s) => (
                      <label key={s.value} className="flex min-h-11 items-center gap-3">
                        <input type="radio" name={it.key} value={s.value} required={i === 0} className="h-5 w-5" />
                        <span>{t(s.label)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <fieldset className="card p-5">
                <legend className="px-1 text-lg font-semibold">{t("Did you see this office's Citizen's Charter?")}</legend>
                <div className="mt-1 flex flex-col">
                  {[["yes", "Yes"], ["no", "No"]].map(([v, l]) => (
                    <label key={v} className="flex min-h-11 items-center gap-3">
                      <input type="radio" name="saw_charter" value={v} className="h-5 w-5" />
                      <span>{t(l)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="card p-5">
                <label className="label" htmlFor="comment">{t("Anything we should improve? (optional)")}</label>
                <p id="comment-hint" className="text-sm text-slate-700">{t("Do not type your name or ID numbers.")}</p>
                <textarea id="comment" name="comment" className="input mt-1" rows={4} maxLength={1000} aria-describedby="comment-hint" />
              </div>
              <button className="btn-primary">{t("Send my answers")}</button>
            </form>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
