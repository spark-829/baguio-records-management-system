import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Office workload" };

type Row = {
  id: string;
  status: Status;
  due_date: string | null;
  created_at: string;
  current_office_id: string;
  routes: { status: Status; created_at: string; to_office_id: string | null }[];
};

const OPEN: Status[] = ["registered", "forwarded", "received", "under_action"];
const DAY = 86_400_000;

/** Per office: what is waiting, being worked on and late, how long things sit there, and how fast work gets done. */
export default async function OfficeWorkloadPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role === "staff" || me.role === "viewer") redirect("/");
  const supabase = await createClient();
  const [{ data }, { data: offices }] = await Promise.all([
    supabase
      .from("rms_records")
      .select("id, status, due_date, created_at, current_office_id, routes:rms_routes(status, created_at, to_office_id)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();

  const stats = (offices ?? []).map((o) => {
    const here = rows.filter((r) => r.current_office_id === o.id && OPEN.includes(r.status));
    // Days each open record has been in this office: since the last step that brought it here
    const held = here.map((r) => {
      const arrived = r.routes.filter((x) => x.to_office_id === o.id).map((x) => x.created_at).sort()[0] ?? r.created_at;
      const lastIn = r.routes.filter((x) => x.to_office_id === o.id && (x.status === "forwarded" || x.status === "registered")).map((x) => x.created_at).sort().at(-1) ?? arrived;
      return (now - Date.parse(lastIn)) / DAY;
    });
    // Finished in the last 90 days by this office: days from arriving to done
    const done = rows
      .filter((r) => !OPEN.includes(r.status) && r.current_office_id === o.id)
      .map((r) => {
        const fin = r.routes.filter((x) => ["completed", "released", "archived"].includes(x.status)).map((x) => x.created_at).sort()[0];
        const arrived = r.routes.filter((x) => x.to_office_id === o.id).map((x) => x.created_at).sort()[0] ?? r.created_at;
        return fin ? { days: (Date.parse(fin) - Date.parse(arrived)) / DAY, at: Date.parse(fin) } : null;
      })
      .filter((x): x is { days: number; at: number } => x !== null && now - x.at <= 90 * DAY);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      ...o,
      waiting: here.filter((r) => r.status === "forwarded" || r.status === "registered").length,
      working: here.filter((r) => r.status === "received" || r.status === "under_action").length,
      late: here.filter((r) => isOverdue(r.due_date, r.status)).length,
      oldest: held.length ? Math.max(...held) : null,
      avgDone: avg(done.map((d) => d.days)),
      doneCount: done.length,
    };
  });
  stats.sort((a, b) => b.late - a.late || b.waiting + b.working - (a.waiting + a.working));
  const fmtDays = (d: number | null) => (d === null ? "—" : d < 1 ? t("less than a day") : t(Math.round(d) === 1 ? "{n} day" : "{n} days", { n: Math.round(d) }));

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p><Link href="/reports">{t("← Reports")}</Link></p>
          <h1 className="text-2xl font-bold">{t("Office workload")}</h1>
          <p className="max-w-3xl text-slate-700">
            {t("Which offices have documents waiting, which are late, and how quickly each office finishes its work. Offices with late documents are listed first.")}
          </p>
        </div>
        <PrintButton label="Print report" />
      </div>
      <h1 className="hidden text-xl font-bold print:block">{t("Office workload, {date}", { date: fmtDate(new Date().toISOString()) })}</h1>

      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th className="px-4 py-2">{t("Office")}</th>
              <th className="px-4 py-2 text-right">{t("Not yet received")}</th>
              <th className="px-4 py-2 text-right">{t("Being worked on")}</th>
              <th className="px-4 py-2 text-right">{t("Late")}</th>
              <th className="px-4 py-2">{t("Longest time in the office")}</th>
              <th className="px-4 py-2">{t("Average time to finish (last 90 days)")}</th>
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
