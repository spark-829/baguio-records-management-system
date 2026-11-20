import Link from "next/link";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, daysFromToday, dueText, fmtDate } from "@/lib/labels";
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
  current_office: { code: string; name: string } | null;
};

export default async function Dashboard() {
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select("id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];

  const open = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  const overdue = open.filter((r) => isOverdue(r.due_date, r.status));
  // Due within the next 7 days (not yet late), soonest first: what to work on this week
  const dueSoon = open
    .filter((r) => r.due_date && !isOverdue(r.due_date, r.status) && daysFromToday(r.due_date) <= 7)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const inbox = rows.filter(
    (r) => r.current_office_id === me.office_id && ["registered", "forwarded", "received", "under_action"].includes(r.status),
  );
  // First day of this month in Manila time, whatever the server's clock zone is
  const monthFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).slice(0, 8) + "01";
  const monthStart = new Date(`${monthFrom}T00:00:00+08:00`);
  const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart);

  const counts = (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ s, n: rows.filter((r) => r.status === s).length }));

  const stats = [
    { label: "Open records", value: open.length, href: "/records?open=1", hint: "See the open ones" },
    { label: isCentral(me) ? "Overdue" : "Overdue (all you can see)", value: overdue.length, alert: overdue.length > 0, href: "/records?overdue=1", hint: "See the late ones" },
    ...(me.office
      ? [{ label: "In my office", value: inbox.length, href: `/records?office=${encodeURIComponent(me.office.code)}&here=1&open=1`, hint: "See my office's open records" }]
      : []),
    { label: "Logged this month", value: thisMonth.length, href: `/records?from=${monthFrom}`, hint: "See this month's records" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Good day, {me.full_name.split(" (")[0].split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? "You can see records across all offices." : `Showing records that ${me.office?.name ?? "your office"} started or now holds.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/records/new" className="btn-primary">Register a record</Link>
          <Link href="/assistant" className="btn-secondary">Ask the assistant</Link>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${stats.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`card block border-t-4 p-5 no-underline hover:shadow-md ${s.alert ? "border-red-300 border-t-red-700 bg-red-50" : "border-t-brand-700"}`}>
            <div className="text-base font-semibold text-slate-700">{s.label}</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${s.alert ? "text-red-700" : "text-brand-900"}`}>{s.value}</div>
            <div className="mt-1 text-base text-brand-700 underline">{s.hint} →</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-bold">Waiting in my office</h2>
          <RecordList rows={inbox} empty={me.office ? "Nothing waiting in your office." : "Your account is not assigned to an office."} showDue />
        </section>
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-bold">By status</h2>
          <ul className="divide-y divide-slate-100">
            {counts.map(({ s, n }) => (
              <li key={s}>
                <Link href={`/records?status=${s}`} className="flex min-h-12 items-center justify-between px-4 py-2 hover:bg-brand-50">
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
          <h2 className="border-b border-red-100 px-4 py-3 text-lg font-bold text-red-800">Overdue</h2>
          <RecordList rows={overdue} empty="" showDue />
        </section>
      )}

      {dueSoon.length > 0 && (
        <section className="card border-amber-200">
          <h2 className="border-b border-amber-100 px-4 py-3 text-lg font-bold text-amber-900">Due in the next 7 days</h2>
          <RecordList rows={dueSoon} empty="" showDue />
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-bold">Recently registered</h2>
          <Link href="/records" className="text-sm text-brand-700 hover:underline">All records</Link>
        </div>
        <RecordList rows={rows.slice(0, 8)} empty="No records yet." />
      </section>
    </div>
  );
}

function RecordList({ rows, empty, showDue = false }: { rows: Row[]; empty: string; showDue?: boolean }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/records/${r.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-brand-50">
            <span className="font-mono text-sm text-slate-600">{r.tracking_no}</span>
            <span className="min-w-0 flex-1 basis-full font-medium sm:basis-60">{r.subject}</span>
            <PriorityBadge priority={r.priority} />
            {isOverdue(r.due_date, r.status) && <OverdueBadge />}
            <StatusBadge status={r.status} />
            {showDue && r.due_date && (
              <span className={`text-sm font-medium ${isOverdue(r.due_date, r.status) ? "text-red-700" : "text-slate-700"}`}>{dueText(r.due_date)}</span>
            )}
            {!showDue && <span className="text-sm text-slate-600">{r.current_office?.name}</span>}
            <span className="text-sm text-slate-600">Logged {fmtDate(r.created_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
