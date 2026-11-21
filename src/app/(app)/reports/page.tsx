import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { PrintButton } from "../records/[id]/slip/print-button";

type Row = {
  id: string;
  status: Status;
  direction: "incoming" | "outgoing";
  created_at: string;
  due_date: string | null;
  tracking_no: string;
  subject: string;
  doc_type: { name: string } | null;
  current_office: { code: string; name: string } | null;
};

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

function tally(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role === "staff") redirect("/");
  const { from, to } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("rms_records")
    .select("id, status, direction, created_at, due_date, tracking_no, subject, doc_type:rms_document_types(name), current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .is("deleted_at", null)
    .order("created_at");
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 864e5).toISOString());
  const { data } = await query.limit(5000);
  const rows = (data ?? []) as unknown as Row[];

  const months = tally(rows, (r) => r.created_at.slice(0, 7))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((m) => ({ ...m, label: new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m.label}-15T00:00:00Z`)) }));
  const overdue = rows.filter((r) => isOverdue(r.due_date, r.status)).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const printedAt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="print-only text-xs font-semibold uppercase tracking-widest">{t("City Government of Baguio · Records Management System (demo)")}</p>
          <h1 className="text-2xl font-bold">{t("Reports")}</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? t("All offices") : t("Records {office} sent or holds", { office: me.office?.name ?? t("your office") })} · {from || to ? t("{a} to {b}", { a: fmtDate(from), b: fmtDate(to) }) : t("all dates")} · {t("{n} records", { n: rows.length })}
          </p>
          <p className="print-only text-sm">{t("Prepared by {name} on {date}", { name: me.full_name, date: printedAt })}</p>
        </div>
        <form className="no-print flex flex-wrap items-end gap-2" method="get">
          <div><label className="label" htmlFor="rep-from">{t("From|date")}</label><input id="rep-from" type="date" name="from" defaultValue={from} className="input" /></div>
          <div><label className="label" htmlFor="rep-to">{t("To|date")}</label><input id="rep-to" type="date" name="to" defaultValue={to} className="input" /></div>
          <button className="btn-secondary">{t("Apply")}</button>
          <a className="btn-secondary" href={`/api/reports/csv?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`}>{t("Download list (Excel)")}</a>
          <PrintButton label="Print report" />
        </form>
      </div>
      <nav aria-label={t("More reports")} className="no-print flex flex-wrap gap-2">
        {me.role !== "viewer" && <Link href="/reports/offices" className="btn-secondary">{t("Office workload")}</Link>}
        {isCentral(me) && <Link href="/reports/retention" className="btn-secondary">{t("Retention schedule")}</Link>}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Incoming", rows.filter((r) => r.direction === "incoming").length],
          ["Outgoing", rows.filter((r) => r.direction === "outgoing").length],
          ["Open", rows.filter((r) => !["completed", "released", "archived"].includes(r.status)).length],
          ["Overdue", overdue.length],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(String(k))}</div>
            <div className="mt-1 text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title={t("By status")} data={tally(rows, (r) => t(STATUS_LABEL[r.status]))} />
        <Bars title={t("By current office")} data={tally(rows, (r) => r.current_office?.name ?? "—")} />
        <Bars title={t("By document type")} data={tally(rows, (r) => r.doc_type?.name ?? "—")} />
        <Bars title={t("Registered per month")} data={months} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">{t("Overdue records")}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="py-1">{t("Tracking no.")}</th><th>{t("Subject")}</th><th>{t("Now with")}</th><th>{t("Was due (oldest first)")}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overdue.map((r) => (
              <tr key={r.tracking_no}><td className="py-1 font-mono text-xs"><Link href={`/records/${r.id}`}>{r.tracking_no}</Link></td><td>{r.subject}</td><td>{r.current_office?.name}</td><td>{fmtDate(r.due_date)}</td></tr>
            ))}
            {overdue.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">{t("None.")}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
