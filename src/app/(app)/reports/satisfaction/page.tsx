import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { hrmoDeadline, monthParam, parseSatisfactionReport, pct, ITEMS } from "@/lib/satisfaction";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Client satisfaction" };

/** Monthly client satisfaction by office. Heads see their own office (RLS), the records desk and admin see all. */
export default async function SatisfactionReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (!(isCentral(me) || me.role === "dept_head")) redirect("/");
  const { month: m } = await searchParams;
  const month = monthParam(m);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_report_satisfaction", { p_month: `${month}-01` });
  if (error) throw new Error("Satisfaction report failed");
  const rep = parseSatisfactionReport(data);
  const P = (y: number, n: number) => { const v = pct(y, n); return v === null ? "—" : `${v}%`; };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("Client satisfaction")}</h1>
        <p className="text-slate-700">{t("Send to the City Human Resource Management Office by {date}.", { date: fmtDate(hrmoDeadline(month)) })}</p>
        <form className="no-print flex flex-wrap items-end gap-2" method="get">
          <div><label className="label" htmlFor="sat-month">{t("Month")}</label><input id="sat-month" type="month" name="month" defaultValue={month} className="input" /></div>
          <button className="btn-secondary">{t("Apply")}</button>
          <a className="btn-secondary" href={`/api/reports/satisfaction?month=${month}`}>{t("Download list (CSV, opens in Excel)")}</a>
          <PrintButton label="Print report" />
        </form>
      </div>

      {rep.offices.length === 0 ? (
        <p className="card p-5">{t("No answers for {month} yet.", { month })}</p>
      ) : (
        <>
          <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={t("Client satisfaction")}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-3">{t("Office")}</th>
                  <th scope="col" className="p-3">{t("Responses")}</th>
                  <th scope="col" className="p-3">{t("Satisfied")} %</th>
                  {ITEMS.slice(1).map((i) => <th key={i.key} scope="col" className="p-3">{t(i.label)} %</th>)}
                  <th scope="col" className="p-3">{t("Saw the Charter")} %</th>
                </tr>
              </thead>
              <tbody>
                {rep.offices.map((o) => (
                  <tr key={o.office_id} className="border-b border-line last:border-0">
                    <th scope="row" className="p-3 font-medium">{o.office}</th>
                    <td className="p-3">{o.responses}</td>
                    <td className="p-3">{P(o.sat_yes, o.sat_n)}</td>
                    <td className="p-3">{P(o.time_yes, o.time_n)}</td>
                    <td className="p-3">{P(o.steps_yes, o.steps_n)}</td>
                    <td className="p-3">{P(o.fair_yes, o.fair_n)}</td>
                    <td className="p-3">{P(o.staff_yes, o.staff_n)}</td>
                    <td className="p-3">{P(o.charter_yes, o.charter_n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rep.comments.length > 0 && (
            <section aria-labelledby="sat-comments" className="card space-y-2 p-5">
              <h2 id="sat-comments" className="text-xl font-bold">{t("Comments")}</h2>
              <ul className="space-y-2">
                {rep.comments.map((c, i) => (
                  <li key={i}>“{c.comment}” <span className="text-sm text-slate-600">{c.office}, {fmtDate(c.at)}</span></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <section className="print-only space-y-2" aria-label={t("Actions taken")}>
        <h2 className="font-bold">{t("Actions taken")}</h2>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-8 border-b border-slate-900" />)}
      </section>
    </div>
  );
}
