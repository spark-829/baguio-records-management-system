import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, daysFromToday, dueText, fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { DueCalendar } from "@/components/due-calendar";

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
  const { t } = await getT();
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data }, { data: totalsData, error: totalsError }] = await Promise.all([
    supabase
    .from("rms_records")
    .select("id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500),
    supabase.rpc("rms_dashboard_totals"),
  ]);
  if (totalsError) console.error("rms_dashboard_totals failed", totalsError.message);
  const rows = (data ?? []) as unknown as Row[];
  const totals = (totalsData ?? {}) as { open?: number; overdue?: number; in_my_office?: number; this_month?: number; by_status?: Record<string, number> };

  const open = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  const overdue = open.filter((r) => isOverdue(r.due_date, r.status));
  const overdueTotal = Number(totals.overdue) || 0;
  // Due within the next 7 days (not yet late), soonest first: what to work on this week
  const dueSoon = open
    .filter((r) => r.due_date && !isOverdue(r.due_date, r.status) && daysFromToday(r.due_date) <= 7)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const inbox = rows.filter(
    (r) => r.current_office_id === me.office_id && ["registered", "forwarded", "received", "under_action"].includes(r.status),
  );
  // First day of this month in Manila time, whatever the server's clock zone is
  const monthFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).slice(0, 8) + "01";

  const counts = (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ s, n: Number(totals.by_status?.[s]) || 0 }));

  const stats = [
    { label: t("Open records"), value: Number(totals.open) || 0, href: "/records?open=1", hint: t("See the open ones") },
    { label: t(isCentral(me) ? "Overdue" : "Overdue (all you can see)"), value: overdueTotal, alert: overdueTotal > 0, href: "/records?overdue=1", hint: t("See the late ones") },
    ...(me.office
      ? [{ label: t("In my office"), value: Number(totals.in_my_office) || 0, href: `/records?office=${encodeURIComponent(me.office.code)}&here=1&open=1`, hint: t("See my office's open records") }]
      : []),
    { label: t("Logged this month"), value: Number(totals.this_month) || 0, href: `/records?from=${monthFrom}`, hint: t("See this month's records") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Good day, {name}", { name: me.full_name.split(" (")[0].split(" ")[0] })}</h1>
          <p className="text-sm text-slate-600">
            {isCentral(me) ? t("You can see records across all offices.") : t("Showing records that {office} started or now holds.", { office: me.office?.name ?? t("your office") })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {me.role !== "viewer" && <Link prefetch={false} href="/records/new" className="btn-primary">{t("Register a record")}</Link>}
          <Link prefetch={false} href="/assistant" className="btn-secondary">{t("Ask the assistant")}</Link>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${stats.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {stats.map((s) => (
          <Link prefetch={false} key={s.label} href={s.href} className={`card block border-t-4 p-5 no-underline hover:shadow-md ${s.alert ? "border-red-300 border-t-red-700 bg-red-50" : "border-t-brand-700"}`}>
            <div className="text-base font-semibold text-slate-700">{s.label}</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${s.alert ? "text-red-700" : "text-brand-900"}`}>{s.value}</div>
            <div className="mt-1 text-base text-brand-700 underline">{s.hint} →</div>
          </Link>
        ))}
      </div>

      <DueCalendar
        today={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())}
        items={open
          .filter((r) => r.due_date)
          .map((r) => ({ id: r.id, tracking_no: r.tracking_no, subject: r.subject, due_date: r.due_date!.slice(0, 10), office: r.current_office?.name ?? null }))}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-bold">{t("Waiting in my office")}</h2>
          <RecordList rows={inbox.slice(0, 20)} empty={t(me.office ? "Nothing waiting in your office." : "Your account is not assigned to an office.")} showDue />
          {inbox.length > 20 && me.office && (
            <p className="px-4 py-3">
              <span className="text-sm text-slate-600">{t("Showing the first {n} of {total}.", { n: 20, total: inbox.length })}</span>{" "}
              <Link prefetch={false} href={`/records?office=${encodeURIComponent(me.office.code)}&here=1&open=1`} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See my office's open records")}</Link>
            </p>
          )}
        </section>
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-bold">{t("By status")}</h2>
          <ul className="divide-y divide-slate-100">
            {counts.map(({ s, n }) => (
              <li key={s}>
                <Link prefetch={false} href={`/records?status=${s}`} className="flex min-h-12 items-center justify-between px-4 py-2 hover:bg-brand-50">
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
          <h2 className="border-b border-red-100 px-4 py-3 text-lg font-bold text-red-800">{t("Overdue")}</h2>
          <RecordList rows={overdue.slice(0, 10)} empty="" showDue />
          {overdue.length > 10 && (
            <p className="px-4 py-3">
              <Link prefetch={false} href="/records?overdue=1" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See all {n} late records", { n: overdueTotal || overdue.length })}</Link>
            </p>
          )}
        </section>
      )}

      {dueSoon.length > 0 && (
        <section id="due-soon" className="card scroll-mt-4 border-amber-200">
          <h2 className="border-b border-amber-100 px-4 py-3 text-lg font-bold text-amber-900">{t("Due in the next 7 days")}</h2>
          <RecordList rows={dueSoon.slice(0, 10)} empty="" showDue />
          {dueSoon.length > 10 && (
            <p className="px-4 py-3 text-sm text-slate-600">{t("Showing the first {n} of {total}.", { n: 10, total: dueSoon.length })}</p>
          )}
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-bold">{t("Recently registered")}</h2>
          <Link prefetch={false} href="/records" className="text-sm text-brand-700 hover:underline">{t("All records")}</Link>
        </div>
        <RecordList rows={rows.slice(0, 8)} empty={t("No records yet.")} />
      </section>
    </div>
  );
}

async function RecordList({ rows, empty, showDue = false }: { rows: Row[]; empty: string; showDue?: boolean }) {
  const { t } = await getT();
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id}>
          <Link prefetch={false} href={`/records/${r.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-brand-50">
            <span className="font-mono text-sm text-slate-600">{r.tracking_no}</span>
            <span className="min-w-0 flex-1 basis-full font-medium sm:basis-60">{r.subject}</span>
            <PriorityBadge priority={r.priority} />
            {isOverdue(r.due_date, r.status) && <OverdueBadge />}
            <StatusBadge status={r.status} />
            {showDue && r.due_date && (
              <span className={`text-sm font-medium ${isOverdue(r.due_date, r.status) ? "text-red-700" : "text-slate-700"}`}>{dueText(r.due_date, undefined, t)}</span>
            )}
            {!showDue && <span className="text-sm text-slate-600">{r.current_office?.name}</span>}
            <span className="text-sm text-slate-600">{t("Logged {date}", { date: fmtDate(r.created_at) })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
