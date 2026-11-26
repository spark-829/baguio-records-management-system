import Form from "next/form";
import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReportsNav } from "@/components/reports-nav";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { cssStatus, hrmoDeadline, monthParam, parseSatisfactionReport, pct, sortCssRows, ITEMS, type SatOffice } from "@/lib/satisfaction";
import { manilaDay } from "@/lib/arta";
import { hasFeature, isHrmoCss } from "@/lib/office-features";
import { FeatureOff } from "@/components/feature-off";
import { sendCssSummary } from "./actions";
import { SendButton } from "./send-button";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Client satisfaction" };

type CssSent = { office_id: string; record_id: string; tracking_no: string; sent_at: string };

/** Monthly client satisfaction by office. Heads see their own office (RLS); the records desk, admin and HRMO see every office. */
export default async function SatisfactionReportPage({ searchParams }: { searchParams: Promise<{ month?: string; sent?: string; failed?: string }> }) {
  const { t, lang } = await getT();
  const me = await getProfile();
  const hrmo = isHrmoCss({ role: me.role, officeCode: me.office?.code, windowFlag: me.window_intake });
  if (!(isCentral(me) || me.role === "dept_head" || hrmo)) redirect("/");
  const consolidated = isCentral(me) || hrmo;
  if (!consolidated && !hasFeature(me, "satisfaction")) return <FeatureOff feature="satisfaction" />;
  const { month: m, sent, failed } = await searchParams;
  const month = monthParam(m);
  const supabase = await createClient();
  const [{ data, error }, { data: allOffices }, { data: cssData }, { data: mySent }] = await Promise.all([
    supabase.rpc("rms_report_satisfaction", { p_month: `${month}-01` }),
    consolidated ? supabase.from("rms_offices").select("id, name").eq("is_active", true).order("code") : Promise.resolve({ data: null }),
    consolidated ? supabase.rpc("rms_css_status", { p_month: `${month}-01` }) : Promise.resolve({ data: null }),
    // An office head: was this month's summary already sent?
    !consolidated && me.role === "dept_head" && me.office_id
      ? supabase.from("rms_records").select("id, tracking_no, created_at").eq("origin_office_id", me.office_id).eq("category", "CSS summary").contains("keywords", [`css-${month}`]).is("deleted_at", null).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error("Satisfaction report failed");
  const rep = parseSatisfactionReport(data);
  const mineResponses = rep.offices.reduce((a, o) => a + o.responses, 0);
  const sentBy = new Map(((Array.isArray(cssData) ? cssData : []) as CssSent[]).map((c) => [c.office_id, c]));
  const deadline = hrmoDeadline(month);
  const today = manilaDay();
  type Row = SatOffice & { state: "sent" | "not_sent" | "late"; css: CssSent | null };
  // Every office appears, with "0 responses" when nobody answered.
  const rows: Row[] = consolidated
    ? sortCssRows(
        (allOffices ?? []).map((o) => {
          const have = rep.offices.find((x) => x.office_id === o.id);
          const css = sentBy.get(o.id) ?? null;
          return {
            ...(have ?? { office_id: o.id, office: o.name, responses: 0, sat_yes: 0, sat_n: 0, time_yes: 0, time_n: 0, steps_yes: 0, steps_n: 0, fair_yes: 0, fair_n: 0, staff_yes: 0, staff_n: 0, charter_yes: 0, charter_n: 0 }),
            state: cssStatus({ sentAt: css?.sent_at, deadline, today }),
            css,
          };
        }),
      )
    : rep.offices.map((o) => ({ ...o, state: "sent" as const, css: null }));
  const P = (y: number, n: number) => { const v = pct(y, n); return v === null ? "—" : `${v}%`; };

  return (
    <div className="space-y-4">
      <ReportsNav me={me} current="/reports/satisfaction" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("Client satisfaction")}</h1>
        <p className="text-slate-700">{t("Send to the City Human Resource Management Office by {date}.", { date: fmtDate(hrmoDeadline(month), lang) })}</p>
        <Form action="/reports/satisfaction" prefetch={false} className="no-print flex flex-wrap items-end gap-2">
          <div><label className="label" htmlFor="sat-month">{t("Month")}</label><input id="sat-month" type="month" name="month" defaultValue={month} className="input" /></div>
          <button className="btn-secondary">{t("Apply")}</button>
          <a className="btn-secondary" href={`/api/reports/satisfaction?month=${month}`}>{t("Download list (CSV, opens in Excel)")}</a>
          <PrintButton label="Print report" />
        </Form>
      </div>

      {sent && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">{t("Sent to HRMO as {tracking}.", { tracking: sent.slice(0, 20) })}</p>}
      {failed && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{t("Could not send the summary. Try again.")}</p>}
      {!consolidated && me.role === "dept_head" && me.office?.code !== "HRMO" && (
        <section className="card space-y-2 p-4" aria-label={t("Send this month's summary to HRMO")}>
          {mySent ? (
            <p>
              {t("Sent on {date} as {tracking}.", { date: fmtDate((mySent as { created_at: string }).created_at, lang), tracking: (mySent as { tracking_no: string }).tracking_no })}{" "}
              <Link href={`/records/${(mySent as { id: string }).id}`}>{t("Open the record")}</Link>
            </p>
          ) : (
            <form action={sendCssSummary} className="no-print">
              <input type="hidden" name="month" value={month} />
              <SendButton label={mineResponses === 0 ? t("Send a no-response notice") : t("Send this month's summary to HRMO")} pendingLabel={t("Saving…")} />
            </form>
          )}
        </section>
      )}

      {rows.length === 0 ? (
        <p className="card p-5">{t("No answers for {month} yet.", { month })}</p>
      ) : (
        <>
          <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={t("Client satisfaction")}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="min-w-[12rem] p-3 align-bottom">{t("Office")}</th>
                  <th scope="col" className="p-3 align-bottom">{t("Responses")}</th>
                  <th scope="col" className="min-w-[7rem] p-3 text-right align-bottom whitespace-normal">{t("Satisfied")} %</th>
                  {ITEMS.slice(1).map((i) => <th key={i.key} scope="col" className="min-w-[8rem] p-3 text-right align-bottom whitespace-normal">{t(i.label)} %</th>)}
                  <th scope="col" className="min-w-[7rem] p-3 text-right align-bottom whitespace-normal">{t("Saw the Charter")} %</th>
                  {consolidated && <th scope="col" className="p-3 align-bottom">{t("Summary sent")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.office_id} className={`border-b border-line last:border-0 ${o.responses === 0 ? "text-slate-600" : ""}`}>
                    <th scope="row" className="p-3 font-medium">{o.office}</th>
                    <td className="p-3 whitespace-nowrap">{t(o.responses === 1 ? "{n} response" : "{n} responses", { n: o.responses })}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.sat_yes, o.sat_n)}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.time_yes, o.time_n)}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.steps_yes, o.steps_n)}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.fair_yes, o.fair_n)}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.staff_yes, o.staff_n)}</td>
                    <td className="p-3 text-right tabular-nums">{P(o.charter_yes, o.charter_n)}</td>
                    {consolidated && (
                      <td className="p-3">
                        {o.state === "sent" && o.css ? (
                          <Link href={`/records/${o.css.record_id}`}>{t("Sent {date}", { date: fmtDate(o.css.sent_at, lang) })}</Link>
                        ) : o.state === "late" ? (
                          <span className="badge bg-red-100 text-red-800">{t("Late")}</span>
                        ) : (
                          <span className="badge bg-slate-100 text-slate-800">{t("Not sent yet")}</span>
                        )}
                      </td>
                    )}
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
                  <li key={i}>“{c.comment}” <span className="text-sm text-slate-600">{c.office}, {fmtDate(c.at, lang)}</span></li>
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
