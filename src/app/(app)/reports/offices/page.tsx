import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportsNav } from "@/components/reports-nav";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Office workload" };

type OfficeRow = {
  id: string;
  code: string;
  name: string;
  waiting: number;
  working: number;
  late: number;
  oldest_days: number | null;
  avg_done_days: number | null;
  done_count: number;
};

/** Per office: what is waiting, being worked on and late, how long things sit there, and how fast work gets done. */
export default async function OfficeWorkloadPage() {
  const { t, lang } = await getT();
  const me = await getProfile();
  if (me.role === "staff" || me.role === "viewer") redirect("/");
  const supabase = await createClient();
  const [{ data, error }, { data: winData }] = await Promise.all([
    supabase.rpc("rms_report_offices"),
    supabase.rpc("rms_report_window_counts"),
  ]);
  if (error) throw new Error("Office workload failed");
  const windowBy = new Map(((winData ?? []) as { office_id: string; n: number }[]).map((w) => [w.office_id, Number(w.n)]));
  const stats = ((data ?? []) as OfficeRow[]).map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    waiting: o.waiting,
    working: o.working,
    late: o.late,
    oldest: o.oldest_days,
    avgDone: o.avg_done_days,
    doneCount: o.done_count,
    atWindow: windowBy.get(o.id) ?? 0,
  }));
  stats.sort((a, b) => b.late - a.late || b.waiting + b.working - (a.waiting + a.working));
  const fmtDays = (d: number | null) => (d === null ? "—" : d < 1 ? t("less than a day") : t(Math.round(d) === 1 ? "{n} day" : "{n} days", { n: Math.round(d) }));

  return (
    <div className="space-y-5">
      <ReportsNav me={me} current="/reports/offices" />
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Office workload")}</h1>
          <p className="max-w-3xl text-slate-700">
            {t("Which offices have documents waiting, which are late, and how quickly each office finishes its work. Offices with late documents are listed first.")}
          </p>
        </div>
        <PrintButton label="Print report" />
      </div>
      <h1 className="hidden text-xl font-bold print:block">{t("Office workload, {date}", { date: fmtDate(new Date().toISOString(), lang) })}</h1>

      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th className="min-w-[13rem] px-4 py-2">{t("Office")}</th>
              <th className="px-4 py-2 text-right">{t("Not yet received")}</th>
              <th className="px-4 py-2 text-right">{t("Being worked on")}</th>
              <th className="px-4 py-2 text-right">{t("Late")}</th>
              <th className="px-4 py-2">{t("Longest time in the office")}</th>
              <th className="px-4 py-2">{t("Average time to finish (last 90 days)")}</th>
              <th className="px-4 py-2 text-right">{t("Received at own window")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((s) => (
              <tr key={s.id} className={s.late ? "bg-red-50/60" : ""}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/records?office=${encodeURIComponent(s.code)}`}>{s.name}</Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{s.waiting}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.working}</td>
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${s.late ? "text-red-700" : ""}`}>
                  {s.late ? <Link className="text-red-700" href={`/records?office=${encodeURIComponent(s.code)}&overdue=1`}>{s.late}</Link> : 0}
                </td>
                <td className="px-4 py-2">{fmtDays(s.oldest)}</td>
                <td className="px-4 py-2">{s.doneCount ? `${fmtDays(s.avgDone)} (${t("{n} finished", { n: s.doneCount })})` : "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.atWindow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-sm text-slate-700">
        {t("Counts include only records your account may see. Click an office to see its records, or the late number to see only the late ones.")}
      </p>
    </div>
  );
}
