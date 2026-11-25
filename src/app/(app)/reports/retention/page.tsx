import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportsNav } from "@/components/reports-nav";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { PERMANENT_YEARS, type RetentionState } from "@/lib/retention";
import { parseRetention } from "@/lib/reports";
import { listSize } from "@/lib/list-size";
import type { Status } from "@/lib/types";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Retention schedule" };

const STATE: Record<RetentionState, { label: string; tone: string }> = {
  review_now: { label: "Keep period over: review for disposal", tone: "bg-red-50 text-red-900 border-red-300" },
  review_soon: { label: "Review within 90 days", tone: "bg-amber-50 text-amber-950 border-amber-300" },
  keep: { label: "Keep", tone: "bg-emerald-50 text-emerald-900 border-emerald-300" },
};

/**
 * Retention schedule: how long each finished record must be kept, by document type,
 * counted from the day it was finished. Nothing is ever deleted from here; it only tells the records desk what to review.
 */
export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ show?: string; n?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin" && me.role !== "records_officer") redirect("/reports");
  const { show, n } = await searchParams;
  const limit = listSize(n, 100, 500);
  const supabase = await createClient();
  const [{ data, error }, { data: types }] = await Promise.all([
    supabase.rpc("rms_report_retention", { p_show: show && show in STATE ? show : null, p_limit: limit }),
    supabase.from("rms_document_types").select("name, retention_years, series_code, series_title").eq("is_active", true).order("retention_years", { ascending: false }),
  ]);
  if (error) throw new Error("Retention totals failed");
  const { counts, rows } = parseRetention(data);
  const total = show && show in STATE ? counts[show as RetentionState] : counts.review_now + counts.review_soon + counts.keep;

  return (
    <div className="space-y-5">
      <ReportsNav me={me} current="/reports/retention" />
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Retention schedule")}</h1>
          <p className="max-w-3xl text-slate-700">
            {t("How long each finished record must be kept, by kind of document, counted from the day it was finished. This page never deletes anything. It only lists what the records desk should review with the Records Officer and the disposal authority.")}
          </p>
        </div>
        <PrintButton label="Print schedule" />
      </div>
      <h1 className="hidden text-xl font-bold print:block">{t("Retention schedule, printed {date}", { date: fmtDate(new Date().toISOString()) })}</h1>

      <section aria-label={t("Summary")} className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {(Object.keys(STATE) as RetentionState[]).map((k) => (
          <Link prefetch={false} key={k} href={show === k ? "/reports/retention" : `/reports/retention?show=${k}`} aria-current={show === k ? "true" : undefined}
            className={`focus-inset block border-b-[3px] px-4 py-3 no-underline hover:bg-brand-50 sm:px-5 sm:py-4 ${show === k ? "border-brand-700 bg-brand-50" : "border-transparent bg-white"}`}>
            <span className="text-sm font-semibold text-brand-700 underline underline-offset-4">{t(STATE[k].label)}</span>
            <span className={`block text-2xl font-semibold tabular-nums ${k === "review_now" && counts[k] > 0 ? "text-red-700" : "text-brand-900"}`}>{counts[k]}</span>
            <span className="mt-1 block text-sm text-slate-600">{t(show === k ? "Show all" : "Show only these")}</span>
          </Link>
        ))}
      </section>

      {total > rows.length && (
        <p className="text-sm text-slate-600">{t("Showing the first {n} of {total}.", { n: rows.length, total })}</p>
      )}
      {total > rows.length && limit < 500 && (
        <p className="no-print">
          <Link prefetch={false} className="btn-secondary" href={`/reports/retention?${new URLSearchParams({ ...(show && show in STATE ? { show } : {}), n: String(limit + 100) })}`}>
            {t("Show {n} more", { n: Math.min(100, total - rows.length) })}
          </Link>
        </p>
      )}

      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th className="px-4 py-2">{t("Tracking no.")}</th>
              <th className="px-4 py-2">{t("Subject")}</th>
              <th className="px-4 py-2">{t("Kind")}</th>
              <th className="px-4 py-2">{t("Finished")}</th>
              <th className="px-4 py-2">{t("Keep until")}</th>
              <th className="px-4 py-2">{t("What to do")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const permanent = r.years >= PERMANENT_YEARS;
              return (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-sm"><Link prefetch={false} href={`/records/${r.id}`}>{r.tracking_no}</Link></td>
                <td className="px-4 py-2">{r.subject}<div className="text-sm text-slate-600">{STATUS_LABEL[r.status as Status]} · {r.office_name}</div></td>
                <td className="px-4 py-2 text-slate-700">{r.type_name}<div className="text-sm text-slate-600">{permanent ? t("Permanent") : r.years === 0 ? t("No keep period") : t("{n} years", { n: r.years })}</div></td>
                <td className="whitespace-nowrap px-4 py-2">{fmtDate(r.finished_at)}</td>
                <td className="whitespace-nowrap px-4 py-2 font-semibold">{r.keep_until ? fmtDate(r.keep_until) : t("Permanent")}</td>
                <td className="px-4 py-2"><span className={`badge border ${STATE[r.state].tone}`}>{t(permanent ? "Keep permanently" : STATE[r.state].label)}</span></td>
              </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">{t("No finished records in this group.")}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">{t("Keep periods by kind of document")}</h2>
        <p className="text-slate-700">{t("Set by the administrator. Based on the City's records disposition schedule.")}</p>
        <p className="text-sm text-slate-600">{t("File plan codes are the City's own records classification, grouped by records series. They are not National Archives (NAP) item numbers.")}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {(types ?? []).map((ty) => (
            <li key={ty.name} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <span>{ty.series_code && <span className="mr-2 font-mono text-sm text-slate-600">{ty.series_code}</span>}{ty.name}{ty.series_title && <span className="block text-sm text-slate-600">{ty.series_title}</span>}</span>
              <span className="font-semibold">{ty.retention_years >= 50 ? t("Permanent (50 years or more)") : t("{n} years", { n: ty.retention_years })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
