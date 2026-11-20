import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PineMark, SiteFooter } from "@/components/brand";
import { STATUS_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import type { Status } from "@/lib/types";

export const metadata = { title: "Track a document" };

type Track =
  | { error: "not_found" | "too_many" }
  | {
      tracking_no: string;
      doc_type: string;
      received: string;
      status: Status | "restricted";
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

/** Public page: a citizen types the tracking number and code from their receipt and sees where the document is. */
export default async function TrackPage({ searchParams }: { searchParams: Promise<{ no?: string; code?: string }> }) {
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
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <PineMark className="h-10 w-10" />
          <div>
            <p className="text-lg font-bold">Track your document</p>
            <p className="text-sm text-brand-100">Baguio RMS demo</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8">
        <p className="text-lg">
          Type the <strong>tracking number</strong> and the <strong>tracking code</strong> printed on the receipt you got when you
          filed your document.
        </p>
        <form className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
          <div>
            <label className="label" htmlFor="no">Tracking number</label>
            <input className="input font-mono uppercase" id="no" name="no" defaultValue={no} placeholder="IN-2026-0001" required autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="code">Tracking code</label>
            <input className="input font-mono uppercase" id="code" name="code" defaultValue={code} placeholder="6 letters or numbers" required autoComplete="off" />
          </div>
          <button className="btn-primary">Check</button>
        </form>

        {result && "error" in result && (
          <p role="alert" className="rounded-lg border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-950">
            {result.error === "too_many"
              ? "Too many tries. Please wait 15 minutes, or ask at the Records Section in City Hall."
              : "We could not find a document with that number and code. Check both against your receipt and try again."}
          </p>
        )}

        {result && !("error" in result) && (
          <section className="card space-y-4 p-5" aria-live="polite">
            <div>
              <p className="font-mono text-sm text-slate-600">{result.tracking_no}</p>
              <h1 className="text-2xl font-bold">{result.doc_type}</h1>
              <p className="text-slate-700">Received on {fmtDate(result.received)}</p>
            </div>
            {result.status === "restricted" ? (
              <p className="rounded-lg bg-slate-50 p-4">
                This document is being processed. Its details are restricted. For questions, please visit the Records Section and bring
                your receipt.
              </p>
            ) : (
              <>
                <div className="rounded-lg border-l-4 border-brand-700 bg-brand-50 p-4">
                  <p className="text-sm text-slate-700">Status now</p>
                  <p className="text-xl font-bold">{PLAIN[result.status]}</p>
                  {result.office && !["completed", "released", "archived"].includes(result.status) && (
                    <p>at the {result.office}</p>
                  )}
                  {result.due && !["completed", "released", "archived"].includes(result.status) && (
                    <p className="text-slate-700">Target date: {fmtDate(result.due)}</p>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold">Progress</h2>
                  <ol className="mt-2 space-y-2">
                    {result.steps.map((s, i) => (
                      <li key={i} className="flex flex-wrap gap-x-3 border-b border-slate-100 pb-2">
                        <span className="w-48 shrink-0 text-slate-600">{fmtDateTime(s.at)}</span>
                        <span>
                          {STATUS_LABEL[s.status]}, {s.office}
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
          City staff? <Link href="/login">Sign in here</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
