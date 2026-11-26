import Form from "next/form";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandLockup, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { Rich } from "@/components/rich";
import { fmtDate, fmtDateTime } from "@/lib/labels";
import { ComplaintChannels } from "@/components/complaint-channels";
import { PrivacyNotice } from "@/components/privacy-notice";
import { COMPLAINT_TYPE, replyDueAt } from "@/lib/complaint";
import { collapseSteps } from "@/lib/history";
import type { Status } from "@/lib/types";

export const metadata = { title: "Track a document" };

type Track =
  | { error: "not_found" | "too_many" }
  | {
      tracking_no: string;
      doc_type: string;
      received: string;
      status: Status | "restricted" | "binned";
      office?: string;
      due?: string | null;
      steps: { at: string; status: Status; office: string }[];
    };

const PLAIN: Record<Status, string> = {
  registered: "Received at City Hall and logged",
  forwarded: "Sent to the office that will act on it",
  received: "Received by the office",
  under_action: "Being worked on",
  completed: "Done",
  released: "Done and sent out",
  archived: "Done and filed",
};

const FINISHED_STATUS: Status[] = ["completed", "released", "archived"];
const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

/** Public page: a citizen types the tracking number and code from their receipt and sees where the document is. */
export default async function TrackPage({ searchParams }: { searchParams: Promise<{ no?: string; code?: string }> }) {
  const { t, lang } = await getT();
  const { no = "", code = "" } = await searchParams;
  let result: Track | null = null;
  if (no && code) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rms_public_track", { p_tracking: no.slice(0, 20), p_code: code.slice(0, 12) });
    result = error ? { error: "not_found" } : (data as Track);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="on-dark border-b-4 border-gold-500 bg-brand-700 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:py-3">
          <BrandLockup />
          <div className="ml-auto"><LangToggle dark /></div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold">{t("Track your document")}</h1>
        <p className="text-lg">
          <Rich text={t("Type the **tracking number** and the **tracking code** printed on the receipt you got when you filed your document.")} />
        </p>
        <Form action="/track" prefetch={false} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="no">{t("Tracking number")}</label>
            <input className="input font-mono uppercase" id="no" name="no" defaultValue={no} placeholder={t("IN-2026-0001")} required autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="code">{t("Tracking code")}</label>
            <input className="input font-mono uppercase" id="code" name="code" defaultValue={code} placeholder={t("6 letters or numbers")} required autoComplete="off" />
          </div>
          <button className="btn-primary">{t("Check")}</button>
        </Form>

        {result && "error" in result && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
            {t(result.error === "too_many"
              ? "Too many tries. Please wait 15 minutes, or ask at the Records Section in City Hall."
              : "We could not find a document with that number and code. Check both against your receipt and try again.")}
          </p>
        )}

        {result && !("error" in result) && (
          <section className="card space-y-4 p-5" aria-live="polite">
            <div>
              <p className="font-mono text-sm text-slate-600">{result.tracking_no}</p>
              <h2 className="text-xl font-bold">{result.doc_type}</h2>
              <p className="text-slate-700">{t("Received on {date}", { date: fmtDate(result.received, lang) })}</p>
            </div>
            {result.status === "binned" ? (
              // A valid receipt for a record the office took off the list: send the citizen to a person, not back to retyping (QA-007).
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
                {t("We found your document, but it can no longer be followed online. Please visit the Records Section at City Hall and bring your receipt.")}
              </p>
            ) : result.status === "restricted" ? (
              <p className="rounded-lg border border-line bg-slate-50 px-4 py-3">
                {t("This document is being processed. Its details are restricted. For questions, please visit the Records Section and bring your receipt.")}
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <p className="text-sm text-slate-700">{t("Status now")}</p>
                  <p className="text-xl font-bold">{t(PLAIN[result.status])}</p>
                  {result.office && !["completed", "released", "archived"].includes(result.status) && (
                    <p>{t("at the {office}", { office: result.office })}</p>
                  )}
                  {result.due && !FINISHED_STATUS.includes(result.status) && (
                    <p className="text-slate-700">{t("Target date: {date}", { date: fmtDate(result.due, lang) })}</p>
                  )}
                  {result.doc_type === COMPLAINT_TYPE && !FINISHED_STATUS.includes(result.status) && (
                    <p className="mt-2">{t("The office must reply within 72 hours, by {date}.", { date: fmtDateTime(replyDueAt(result.received).toISOString(), lang) })}</p>
                  )}
                  {/* Like parcel tracking's "delayed" note: say plainly when the target date has passed (QA-008). */}
                  {result.due && !FINISHED_STATUS.includes(result.status) && result.due.slice(0, 10) < manilaToday() && (
                    <p className="mt-2 font-semibold text-amber-900">
                      {t("Taking longer than planned. The office is still working on it. For questions, visit the Records Section and bring your receipt.")}
                    </p>
                  )}
                </div>
                <section aria-labelledby="progress-h">
                  <h2 id="progress-h" className="font-semibold">{t("Progress")}</h2>
                  <ol className="relative ml-2 mt-3 border-l-2 border-line">
                    {/* Oldest first, the same order as the history on the record page; the current step is the last one. */}
                    {collapseSteps(result.steps).map((s, i, all) => (
                      <li key={i} className="mb-4 ml-4 last:mb-0" aria-current={i === all.length - 1 ? "step" : undefined}>
                        <span aria-hidden="true" className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                        <p className={i === all.length - 1 ? "font-bold text-ink" : "text-slate-800"}>{t(PLAIN[s.status])} · {s.office}</p>
                        <p className="text-sm text-slate-600"><time dateTime={s.at}>{fmtDateTime(s.at, lang)}</time></p>
                      </li>
                    ))}
                  </ol>
                </section>
                {FINISHED_STATUS.includes(result.status as Status) && (
                  <Link className="btn-secondary" href={`/survey?no=${encodeURIComponent(result.tracking_no)}&code=${encodeURIComponent(code.slice(0, 12))}`}>{t("Rate our service")}</Link>
                )}
              </>
            )}
          </section>
        )}
        <ComplaintChannels />
        <PrivacyNotice where="track" />
        <p className="text-slate-700">
          {t("City staff?")} <Link href="/login" className="tap-link font-semibold text-brand-700 underline underline-offset-2">{t("Sign in here")}</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
