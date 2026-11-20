import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { PrintButton } from "../records/[id]/slip/print-button";

type Row = {
  status: Status;
  direction: "incoming" | "outgoing";
  created_at: string;
  due_date: string | null;
  tracking_no: string;
  subject: string;
  doc_type: { name: string } | null;
  current_office: { code: string; name: string } | null;
};

function Bars({ title, data }: { title: string; data: { label: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate text-slate-600">{d.label}</span>
            <span className="h-3 rounded bg-slate-100">
              <span className="block h-3 rounded bg-brand-600" style={{ width: `${(d.n / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{d.n}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-sm text-slate-500">No data.</li>}
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
  const me = await getProfile();
  if (me.role === "staff") redirect("/");
  const { from, to } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("rms_records")
    .select("status, direction, created_at, due_date, tracking_no, subject, doc_type:rms_document_types(name), current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .order("created_at");
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 864e5).toISOString());
  const { data } = await query.limit(5000);
  const rows = (data ?? []) as unknown as Row[];

  const months = tally(rows, (r) => r.created_at.slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label));
  const overdue = rows.filter((r) => isOverdue(r.due_date, r.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? "All offices" : me.office?.name} · {from || to ? `${fmtDate(from)} to ${fmtDate(to)}` : "all dates"} · {rows.length} records
          </p>
        </div>
        <form className="no-print flex flex-wrap items-end gap-2" method="get">
          <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
          <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
          <button className="btn-secondary">Apply</button>
          <a className="btn-secondary" href={`/api/reports/csv?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`}>Export CSV</a>
          <PrintButton />
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Incoming", rows.filter((r) => r.direction === "incoming").length],
          ["Outgoing", rows.filter((r) => r.direction === "outgoing").length],
          ["Open", rows.filter((r) => !["completed", "released", "archived"].includes(r.status)).length],
          ["Overdue", overdue.length],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title="By status" data={tally(rows, (r) => STATUS_LABEL[r.status])} />
        <Bars title="By current office" data={tally(rows, (r) => r.current_office?.code ?? "—")} />
        <Bars title="By document type" data={tally(rows, (r) => r.doc_type?.name ?? "—")} />
        <Bars title="Registered per month" data={months} />
      </div>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Overdue records</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="py-1">Tracking no.</th><th>Subject</th><th>Office</th><th>Due</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overdue.map((r) => (
              <tr key={r.tracking_no}><td className="py-1 font-mono text-xs">{r.tracking_no}</td><td>{r.subject}</td><td>{r.current_office?.code}</td><td>{fmtDate(r.due_date)}</td></tr>
            ))}
            {overdue.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">None.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
