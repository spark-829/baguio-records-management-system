import { txLabel } from "@/lib/transaction-type";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import type { Status } from "@/lib/types";
import { monthLabel, onTimeSummary, parseOnTime, parseSummary, reportBounds, toBars } from "@/lib/reports";
import { PrintButton } from "../records/[id]/slip/print-button";

async function Bars({ title, data }: { title: string; data: { label: string; n: number }[] }) {
  const { t } = await getT();
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(7rem,14rem)_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="text-slate-700">{d.label}</span>
            <span className="h-3 rounded bg-slate-100">
              <span className="block h-3 rounded bg-brand-600" style={{ width: `${(d.n / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{d.n}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-sm text-slate-500">{t("No data.")}</li>}
      </ul>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role === "staff") redirect("/");
  const { from, to } = await searchParams;
  const supabase = await createClient();
  const b = reportBounds(from, to);
  const [{ data, error }, { data: onData, error: onErr }] = await Promise.all([
    supabase.rpc("rms_report_summary", { p_from: b.from, p_to: b.to, p_overdue_limit: 200 }),
    supabase.rpc("rms_report_on_time", { p_from: b.from, p_to: b.to }),
  ]);
  if (error) throw new Error("Report totals failed");
  const s = parseSummary(data);
  const onTime = onErr ? null : onTimeSummary(parseOnTime(onData));
  const months = s.by_month.map((m) => ({ label: monthLabel(m.key), n: m.n }));
  const printedAt = fmtDateTime(new Date().toISOString());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="print-only text-xs font-semibold uppercase tracking-widest">{t("City Government of Baguio · Records Management System (demo)")}</p>
          <h1 className="text-2xl font-bold">{t("Reports")}</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? t("All offices") : t("Records {office} sent or holds", { office: me.office?.name ?? t("your office") })} · {from || to ? t("{a} to {b}", { a: fmtDate(from), b: fmtDate(to) }) : t("all dates")} · {t("{n} records", { n: s.total })}
          </p>
          <p className="print-only text-sm">{t("Prepared by {name} on {date}", { name: me.full_name, date: printedAt })}</p>
        </div>
        <form className="no-print flex flex-wrap items-end gap-2" method="get">
          <div><label className="label" htmlFor="rep-from">{t("From|date")}</label><input id="rep-from" type="date" name="from" defaultValue={from} className="input" /></div>
          <div><label className="label" htmlFor="rep-to">{t("To|date")}</label><input id="rep-to" type="date" name="to" defaultValue={to} className="input" /></div>
          <button className="btn-secondary">{t("Apply")}</button>
          <a className="btn-secondary" href={`/api/reports/csv?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`}>{t("Download list (CSV, opens in Excel)")}</a>
          <PrintButton label="Print report" />
        </form>
      </div>
      <nav aria-label={t("More reports")} className="no-print flex flex-wrap gap-2">
        {me.role !== "viewer" && <Link href="/reports/offices" className="btn-secondary">{t("Office workload")}</Link>}
        {(isCentral(me) || me.role === "dept_head") && <Link href="/reports/satisfaction" className="btn-secondary">{t("Client satisfaction")}</Link>}
        {isCentral(me) && <Link href="/reports/retention" className="btn-secondary">{t("Retention schedule")}</Link>}
        {(me.role === "records_officer" || me.role === "dept_head") && <Link href="/reports/released" className="btn-secondary">{t("Released documents logbook")}</Link>}
        {me.role === "records_officer" && <Link href="/reports/step-times" className="btn-secondary">{t("Standard time per step")}</Link>}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Incoming", s.incoming],
          ["Outgoing", s.outgoing],
          ["Open", s.open],
          ["Overdue", s.overdue],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(String(k))}</div>
            <div className="mt-1 text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title={t("By status")} data={toBars(s.by_status, (k) => t(STATUS_LABEL[k as Status] ?? k))} />
        <Bars title={t("By current office")} data={toBars(s.by_office, (k) => k)} />
        <Bars title={t("By document type")} data={toBars(s.by_type, (k) => k)} />
        <Bars title={t("By transaction type")} data={toBars(s.by_tx, (k) => t(txLabel(k)))} />
        <Bars title={t("Registered per month")} data={months} />
      </div>

      {onTime && (
        <section className="card p-4">
          <h2 className="font-semibold">{t("Finished on time")}</h2>
          <p className="mb-3 text-sm text-slate-600">{t("Records with a due date that were finished in this period.")}</p>
          {onTime.finished === 0 ? (
            <p className="text-sm text-slate-500">{t("No finished records with a due date in this period.")}</p>
          ) : (
            <>
              <p className="mb-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold">{onTime.pct}%</span>
                <span className="text-sm text-slate-700">{t("{on} of {n} finished on or before the due date", { on: onTime.on_time, n: onTime.finished })}</span>
              </p>
              <ul className="space-y-2">
                {onTime.offices.map((o) => (
                  <li key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 text-sm sm:grid-cols-[minmax(7rem,14rem)_1fr_7rem]">
                    <span className="text-slate-700">{o.name}</span>
                    <span className="col-span-2 row-start-2 h-3 rounded bg-slate-100 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <span className={`block h-3 rounded ${o.pct < 50 ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${o.pct}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right font-semibold tabular-nums sm:col-start-3 sm:row-start-1">{o.pct}% ({o.on_time}/{o.finished})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">{t("Overdue records")}</h2>
        <div className="-mx-4 overflow-x-auto px-4" tabIndex={0} role="region" aria-label={t("Overdue records (scroll sideways for more columns)")}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-1 pr-3">{t("Tracking no.")}</th><th className="pr-3">{t("Subject")}</th><th className="pr-3">{t("Now with")}</th><th>{t("Was due (oldest first)")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.overdue_rows.map((r) => (
                <tr key={r.tracking_no}><td className="whitespace-nowrap py-1 pr-3 font-mono text-xs"><Link href={`/records/${r.id}`}>{r.tracking_no}</Link></td><td className="min-w-[10rem] pr-3">{r.subject}</td><td className="pr-3">{r.office}</td><td>{fmtDate(r.due_date)}</td></tr>
              ))}
              {s.overdue === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">{t("None.")}</td></tr>}
            </tbody>
          </table>
        </div>
        {s.overdue > s.overdue_rows.length && (
          <p className="mt-2 text-sm text-slate-600">
            {t("Showing the {n} oldest of {total}.", { n: s.overdue_rows.length, total: s.overdue })} <Link href="/records?overdue=1">{t("See all late records")}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
