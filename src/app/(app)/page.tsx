import Link from "next/link";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";

type Row = {
  id: string;
  tracking_no: string;
  subject: string;
  status: Status;
  priority: "low" | "normal" | "urgent";
  direction: "incoming" | "outgoing";
  due_date: string | null;
  created_at: string;
  current_office_id: string;
  current_office: { code: string } | null;
};

export default async function Dashboard() {
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select("id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, current_office:rms_offices!rms_records_current_office_id_fkey(code)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];

  const open = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  const overdue = open.filter((r) => isOverdue(r.due_date, r.status));
  const inbox = rows.filter(
    (r) => r.current_office_id === me.office_id && ["registered", "forwarded", "received", "under_action"].includes(r.status),
  );
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart);

  const counts = (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ s, n: rows.filter((r) => r.status === s).length }));

  const stats = [
    { label: "Open records", value: open.length },
    { label: "Overdue", value: overdue.length, alert: overdue.length > 0 },
    { label: "In my office", value: inbox.length },
    { label: "Registered this month", value: thisMonth.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Good day, {me.full_name.split(" (")[0].split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? "You can see records across all offices." : `Showing records for ${me.office?.name ?? "your office"}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/records/new" className="btn-primary">Register a record</Link>
          <Link href="/assistant" className="btn-secondary">Ask the assistant</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`card p-4 ${s.alert ? "border-red-300 bg-red-50" : ""}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className={`mt-1 text-3xl font-bold ${s.alert ? "text-red-700" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">Waiting in my office</h2>
          <RecordList rows={inbox} empty="Nothing waiting in your office." />
        </section>
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">By status</h2>
          <ul className="divide-y divide-slate-100">
            {counts.map(({ s, n }) => (
              <li key={s}>
                <Link href={`/records?status=${s}`} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50">
                  <StatusBadge status={s} />
                  <span className="font-semibold tabular-nums">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {overdue.length > 0 && (
        <section className="card border-red-200">
          <h2 className="border-b border-red-100 px-4 py-3 font-semibold text-red-800">Overdue</h2>
          <RecordList rows={overdue} empty="" />
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Recently registered</h2>
          <Link href="/records" className="text-sm text-brand-700 hover:underline">All records</Link>
        </div>
        <RecordList rows={rows.slice(0, 8)} empty="No records yet." />
      </section>
    </div>
  );
}

function RecordList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/records/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
            <span className="font-mono text-xs text-slate-500">{r.tracking_no}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{r.subject}</span>
            <PriorityBadge priority={r.priority} />
            {isOverdue(r.due_date, r.status) && <OverdueBadge />}
            <StatusBadge status={r.status} />
            <span className="w-14 text-right text-xs text-slate-500">{r.current_office?.code}</span>
            <span className="w-24 text-right text-xs text-slate-500">{fmtDate(r.created_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
