import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, dueText, fmtDate } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { sortNeedsAction } from "@/lib/needs-action";
import { DueCalendar } from "@/components/due-calendar";
import { SecurityHub } from "./security-hub";
import { CityOverview, ScopeLinks } from "./city-overview";
import { isOversight } from "@/lib/office-features";

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
  assigned_to?: string | null;
  current_office: { code: string; name: string } | null;
};

export async function generateMetadata() {
  const me = await getProfile();
  return { title: me.role === "admin" ? "Security overview" : "Dashboard" };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role === "admin") return <SecurityHub me={me} />;
  const oversight = isOversight({ role: me.role, officeCode: me.office?.code, features: me.office?.features });
  if (oversight && (await searchParams).scope === "city") {
    // City view: one aggregated call; the own-office queries below are skipped.
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("Good day, {name}", { name: me.full_name.split(" (")[0].split(" ")[0] })}</h1>
        <ScopeLinks base="/" scope="city" />
        <CityOverview />
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data }, { data: totalsData, error: totalsError }, { data: mineData }] = await Promise.all([
    supabase
    .from("rms_records")
    .select("id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, assigned_to, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500),
    supabase.rpc("rms_dashboard_totals"),
    // Records assigned to me that are still being worked on (indexed on assigned_to).
    me.role === "viewer"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("rms_records")
          .select("id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, assigned_to, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)")
          .eq("assigned_to", me.id)
          .is("deleted_at", null)
          .in("status", ["registered", "received", "under_action"])
          .limit(20),
  ]);
  if (totalsError) console.error("rms_dashboard_totals failed", totalsError.message);
  const rows = (data ?? []) as unknown as Row[];
  const totals = (totalsData ?? {}) as { open?: number; overdue?: number; in_my_office?: number; this_month?: number; by_status?: Record<string, number> };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const open = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  const overdueTotal = Number(totals.overdue) || 0;
  const officeTotal = Number(totals.in_my_office) || 0;
  const inbox = rows.filter(
    (r) => r.current_office_id === me.office_id && ["registered", "forwarded", "received", "under_action"].includes(r.status),
  );
  const needsAction = sortNeedsAction(inbox, today).slice(0, 8);
  const mine = sortNeedsAction((mineData ?? []) as unknown as Row[], today);
  const officeHref = me.office ? `/records?office=${encodeURIComponent(me.office.code)}&here=1&open=1` : null;
  // First day of this month in Manila time, whatever the server's clock zone is
  const monthFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).slice(0, 8) + "01";

  const counts = (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ s, n: Number(totals.by_status?.[s]) || 0 }));

  const stats = [
    { label: t("Open records"), value: Number(totals.open) || 0, href: "/records?open=1", alert: false },
    { label: t(isCentral(me) ? "Overdue" : "Overdue (all you can see)"), value: overdueTotal, alert: overdueTotal > 0, href: "/records?overdue=1" },
    ...(officeHref ? [{ label: t("In my office"), value: officeTotal, href: officeHref, alert: false }] : []),
    { label: t("Logged this month"), value: Number(totals.this_month) || 0, href: `/records?from=${monthFrom}`, alert: false },
  ];

  const RecordRow = ({ r, hint }: { r: Row; hint: string | null }) => {
    const late = isOverdue(r.due_date, r.status);
    return (
      <li>
        <Link prefetch={false} href={`/records/${r.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-brand-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
          <span className="font-semibold text-ink">{r.subject}</span>
          <span className="flex flex-wrap items-start gap-2 self-start sm:justify-end">
            {late && <OverdueBadge />}
            <PriorityBadge priority={r.priority} />
            <StatusBadge status={r.status} />
          </span>
          <span className="text-sm text-slate-600 sm:col-span-2">
            <span className="font-mono">{r.tracking_no}</span> ·{" "}
            {r.due_date ? (
              <span className={late ? "font-semibold text-red-700" : undefined}>{dueText(r.due_date, undefined, t)}</span>
            ) : (
              t("Logged {date}", { date: fmtDate(r.created_at) })
            )}
            {hint ? ` · ${hint}` : ""}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Good day, {name}", { name: me.full_name.split(" (")[0].split(" ")[0] })}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isCentral(me) ? t("You can see records across all offices.") : t("Showing records that {office} started or now holds.", { office: me.office?.name ?? t("your office") })}
          </p>
          {oversight && <div className="mt-3"><ScopeLinks base="/" scope="mine" /></div>}
        </div>
        {me.role !== "viewer" && (
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href="/records/new" className="btn-primary">{t("Register a record")}</Link>
          </div>
        )}
      </div>

      <section aria-label={t("Summary")} className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line ${stats.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {stats.map((s, i) => (
          <Link prefetch={false} key={s.label} href={s.href} className={`focus-inset block bg-white px-4 py-3 no-underline hover:bg-brand-50 sm:px-5 sm:py-4 ${stats.length === 3 && i === 2 ? "col-span-2 md:col-span-1" : ""}`}>
            <span className="text-sm font-semibold text-brand-700 underline underline-offset-4">{s.label}</span>
            <span className={`block text-2xl font-semibold tabular-nums ${s.alert ? "text-red-700" : "text-brand-900"}`}>{s.value}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
        {me.role !== "viewer" && (
          <section className="card" aria-labelledby="assigned-title">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h2 id="assigned-title" className="text-lg font-bold">{t("Assigned to me")}</h2>
            </div>
            {mine.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t("Nothing is assigned to you right now.")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {mine.map((r) => <RecordRow key={r.id} r={r} hint={null} />)}
              </ul>
            )}
          </section>
        )}
        <section className="card" aria-labelledby="needs-action-title">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 id="needs-action-title" className="text-lg font-bold">{t("Waiting in my office")}</h2>
            <p className="text-sm text-slate-600">{t("Late and due-soon records come first.")}</p>
          </div>
          {needsAction.length === 0 && officeTotal === 0 && (
            <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t(me.office ? "Nothing waiting in your office." : "Your account is not assigned to an office.")}</p>
          )}
          {needsAction.length > 0 && (
            <ul className="divide-y divide-line">
              {needsAction.map((r) => (
                <RecordRow key={r.id} r={r} hint={me.role === "dept_head" && !r.assigned_to ? t("Not assigned") : null} />
              ))}
            </ul>
          )}
          {officeHref && officeTotal > 0 && (
            <p className="border-t border-line px-4 py-3 sm:px-5">
              <Link prefetch={false} href={officeHref} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See all {n} in my office", { n: officeTotal })}</Link>
            </p>
          )}
        </section>
        </div>
        <section className="card lg:self-start">
          <h2 className="border-b border-line px-4 py-3 text-lg font-bold">{t("By status")}</h2>
          <ul className="divide-y divide-line">
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

      <DueCalendar
        today={today}
        lateTotal={overdueTotal}
        items={open
          .filter((r) => r.due_date)
          .map((r) => ({ id: r.id, tracking_no: r.tracking_no, subject: r.subject, due_date: r.due_date!.slice(0, 10), office: r.current_office?.name ?? null }))}
      />
    </div>
  );
}
