import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { manilaDay } from "@/lib/arta";
import { METHOD_LABEL, isDay, manilaClock, parseLogbook, receivedText, type SendMethod } from "@/lib/dispatch";
import { hasFeature } from "@/lib/office-features";
import { FeatureOff } from "@/components/feature-off";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Released documents logbook" };

/** The daily logbook of outgoing documents: the records desk sees every office, an office head sees their own. */
export default async function ReleasedLogbookPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "records_officer" && me.role !== "dept_head") redirect("/reports");
  if (!hasFeature(me, "logbook")) return <FeatureOff feature="logbook" />;
  const sp = await searchParams;
  const day = isDay(sp.day ?? "") ? (sp.day as string) : manilaDay();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_report_released", { p_day: day });
  const rows = parseLogbook(data);

  return (
    <div className="space-y-4">
      <style>{"@media print{@page{size:A4 landscape;margin:10mm}.sig-col{display:table-cell!important}}.sig-col{display:none}"}</style>
      <Link href="/reports" className="no-print text-sm text-brand-700 hover:underline">{t("Back to reports")}</Link>
      <div>
        <h1 className="text-2xl font-bold">{t("Released documents logbook")}</h1>
        <p className="text-sm text-slate-600">{t("Outgoing documents sent out on {date}", { date: fmtDate(day) })}</p>
        <p className="print-only text-sm">{isCentral(me) ? t("All offices") : me.office?.name}</p>
      </div>
      <div className="no-print flex flex-wrap items-end justify-between gap-2">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="log-day">{t("Date")}</label>
            <input id="log-day" type="date" name="day" defaultValue={day} className="input min-h-12" />
          </div>
          <button className="btn-secondary min-h-12">{t("Show")}</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`/api/reports/csv?report=released&day=${day}`}>{t("Download CSV")}</a>
          <PrintButton label="Print logbook" />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">{t("The logbook could not be loaded. Please try again.")}</p>
      ) : rows.length === 0 ? (
        <p className="card p-4 text-sm text-slate-700">{t("Nothing was sent out on {date}.", { date: fmtDate(day) })}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th scope="col" className="px-3 py-2">{t("Time")}</th>
                <th scope="col" className="px-3 py-2">{t("Record no.")}</th>
                <th scope="col" className="px-3 py-2">{t("Subject")}</th>
                <th scope="col" className="px-3 py-2">{t("To whom")}</th>
                <th scope="col" className="px-3 py-2">{t("How sent")}</th>
                <th scope="col" className="px-3 py-2">{t("Courier tracking no.")}</th>
                <th scope="col" className="px-3 py-2">{t("Sent by")}</th>
                <th scope="col" className="px-3 py-2">{t("Received by")}</th>
                <th scope="col" className="sig-col px-3 py-2">{t("Signature")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{manilaClock(r.sent_at)}</td>
                  <td className="px-3 py-2"><Link href={`/records/${r.record_id}`} className="font-mono whitespace-nowrap">{r.tracking_no}</Link></td>
                  <td className="px-3 py-2">{r.subject}</td>
                  <td className="px-3 py-2">{r.recipient || "—"}</td>
                  <td className="px-3 py-2">
                    {t(METHOD_LABEL[r.method as SendMethod] ?? r.method)}
                    {r.courier ? ` · ${r.courier}` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.courier_tracking ?? "—"}</td>
                  <td className="px-3 py-2">{r.sent_by ?? "—"}</td>
                  <td className="px-3 py-2">{receivedText(r)}</td>
                  <td className="sig-col h-12 min-w-40 px-3 py-2" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
