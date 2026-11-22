import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PineMark, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { Rich } from "@/components/rich";
import { fmtDate, fmtDateTime } from "@/lib/labels";
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
  const { t } = await getT();
  const { no = "", code = "" } = await searchParams;
  let result: Track | null = null;
  if (no && code) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rms_public_track", { p_tracking: no.slice(0, 20), p_code: code.slice(0, 12) });
    result = error ? { error: "not_found" } : (data as Track);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-4">
          <PineMark className="h-10 w-10" />
          <div>
            <p className="text-lg font-bold">{t("Track your document")}</p>
            <p className="text-sm text-brand-100">{t("Baguio RMS demo")}</p>
          </div>
          <div className="ml-auto">
            <LangToggle dark />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8">
        <p className="text-lg">
          <Rich text={t("Type the **tracking number** and the **tracking code** printed on the receipt you got when you filed your document.")} />
        </p>
        <form className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
          <div>
            <label className="label" htmlFor="no">{t("Tracking number")}</label>
            <input className="input font-mono uppercase" id="no" name="no" defaultValue={no} placeholder={t("IN-2026-0001")} required autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="code">{t("Tracking code")}</label>
            <input className="input font-mono uppercase" id="code" name="code" defaultValue={code} placeholder={t("6 letters or numbers")} required autoComplete="off" />
          </div>
          <button className="btn-primary">{t("Check")}</button>
        </form>

        {result && "error" in result && (
          <p role="alert" className="rounded-lg border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-950">
            {t(result.error === "too_many"
              ? "Too many tries. Please wait 15 minutes, or ask at the Records Section in City Hall."
              : "We could not find a document with that number and code. Check both against your receipt and try again.")}
          </p>
        )}

        {result && !("error" in result) && (
          <section className="card space-y-4 p-5" aria-live="polite">
            <div>
              <p className="font-mono text-sm text-slate-600">{result.tracking_no}</p>
              <h1 className="text-2xl font-bold">{result.doc_type}</h1>
              <p className="text-slate-700">{t("Received on {date}", { date: fmtDate(result.received) })}</p>
            </div>
            {result.status === "binned" ? (
              // A valid receipt for a record the office took off the list: send the citizen to a person, not back to retyping (QA-007).
              <p className="rounded-lg border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-950">
                {t("We found your document, but it can no longer be followed online. Please visit the Records Section at City Hall and bring your receipt.")}
              </p>
            ) : result.status === "restricted" ? (
              <p className="rounded-lg bg-slate-50 p-4">
                {t("This document is being processed. Its details are restricted. For questions, please visit the Records Section and bring your receipt.")}
              </p>
            ) : (
              <>
                <div className="rounded-lg border-l-4 border-brand-700 bg-brand-50 p-4">
                  <p className="text-sm text-slate-700">{t("Status now")}</p>
                  <p className="text-xl font-bold">{t(PLAIN[result.status])}</p>
                  {result.office && !["completed", "released", "archived"].includes(result.status) && (
                    <p>{t("at the {office}", { office: result.office })}</p>
                  )}
                  {result.due && !FINISHED_STATUS.includes(result.status) && (
                    <p className="text-slate-700">{t("Target date: {date}", { date: fmtDate(result.due) })}</p>
                  )}
                  {/* Like parcel tracking's "delayed" note: say plainly when the target date has passed (QA-008). */}
                  {result.due && !FINISHED_STATUS.includes(result.status) && result.due.slice(0, 10) < manilaToday() && (
                    <p className="mt-2 font-semibold text-amber-900">
                      {t("Taking longer than planned. The office is still working on it. For questions, visit the Records Section and bring your receipt.")}
                    </p>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold">{t("Progress")}</h2>
                  <ol className="mt-2 space-y-2">
                    {collapseSteps(result.steps).map((s, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3 border-b border-slate-100 pb-2">
                        <span className="w-48 shrink-0 text-slate-600">{fmtDateTime(s.at)}</span>
                        <span>
                          {t(PLAIN[s.status])}: {s.office}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </section>
        )}
        <p className="text-slate-700">
          {t("City staff?")} <Link href="/login">{t("Sign in here")}</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
