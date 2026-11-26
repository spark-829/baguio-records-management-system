import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_ORDER, dueText, fmtDate, greetingName } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { sortNeedsAction } from "@/lib/needs-action";
import { DueCalendar } from "@/components/due-calendar";
import { SecurityHub } from "./security-hub";
import { CityOverview, ScopeLinks } from "./city-overview";
import { isOversight, startScreen } from "@/lib/office-features";
import { ScanQrButton } from "@/components/scan-qr-button";
import { countText, dueAgenda, headHint, lateByOffice, lateHere, loggedOn, needsDecision, nextStepHint, notInBox, oldestGroup, readyToSend, windowQueue } from "@/lib/records-desk";
import { StatStrip } from "@/components/stat-strip";

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
  box_id?: string | null;
  created_by?: string | null;
  origin_office_id?: string | null;
  current_office: { code: string; name: string } | null;
};

export async function generateMetadata() {
  const me = await getProfile();
  return { title: me.role === "admin" ? "Security overview" : "Dashboard" };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ scope?: string; cal?: string }> }) {
  const { t, lang } = await getT();
  const me = await getProfile();
  const sp = await searchParams;
  if (me.role === "admin") return <SecurityHub me={me} />;
  const oversight = isOversight({ role: me.role, officeCode: me.office?.code, features: me.office?.features });
  if (oversight && sp.scope === "city") {
    // City view: one aggregated call; the own-office queries below are skipped.
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("Good day, {name}", { name: greetingName(me.full_name) })}</h1>
        <ScopeLinks base="/" scope="city" />
        <CityOverview />
      </div>
    );
  }
  const supabase = await createClient();
  const screen = startScreen(me);
  const COLS = "id, tracking_no, subject, status, priority, direction, due_date, created_at, current_office_id, assigned_to, box_id, created_by, origin_office_id, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)";
  const dayStart = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())}T00:00:00+08:00`;
  const OFFICE_CAP = 300;
  const [{ data }, { data: totalsData, error: totalsError }, { data: mineData }, { data: officeData }, { data: todayData }] = await Promise.all([
    supabase
    .from("rms_records")
    .select(COLS)
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
    // Window and head screens: every open record held by my office (the 500 latest above can miss older ones).
    (screen === "window" || screen === "head") && me.office_id
      ? supabase.from("rms_records").select(COLS).eq("current_office_id", me.office_id).is("deleted_at", null)
          .in("status", ["registered", "forwarded", "received", "under_action"]).order("created_at", { ascending: false }).limit(OFFICE_CAP)
      : Promise.resolve({ data: null }),
    // Window screen: incoming records logged today by me or at my office.
    screen === "window"
      ? supabase.from("rms_records").select(COLS).is("deleted_at", null).eq("direction", "incoming").gte("created_at", dayStart)
          .or(me.office_id ? `created_by.eq.${me.id},origin_office_id.eq.${me.office_id}` : `created_by.eq.${me.id}`)
          .order("created_at", { ascending: false }).limit(OFFICE_CAP)
      : Promise.resolve({ data: null }),
  ]);
  if (totalsError) console.error("rms_dashboard_totals failed", totalsError.message);
  const rows = (data ?? []) as unknown as Row[];
  const totals = (totalsData ?? {}) as { open?: number; overdue?: number; in_my_office?: number; this_month?: number; by_status?: Record<string, number> };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const open = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  const overdueTotal = Number(totals.overdue) || 0;
  const officeTotal = Number(totals.in_my_office) || 0;
  const officeRows = (officeData ?? null) as unknown as Row[] | null;
  const officeCapped = (officeRows?.length ?? 0) >= OFFICE_CAP;
  const inbox = officeRows ?? rows.filter(
    (r) => r.current_office_id === me.office_id && ["registered", "forwarded", "received", "under_action"].includes(r.status),
  );
  const needsAction = sortNeedsAction(inbox, today).slice(0, 8);
  const mine = sortNeedsAction((mineData ?? []) as unknown as Row[], today);
  const officeHref = me.office ? `/records?office=${encodeURIComponent(me.office.code)}&here=1&open=1` : null;
  // First day of this month in Manila time, whatever the server's clock zone is
  const monthFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()).slice(0, 8) + "01";

  const counts = STATUS_ORDER.map((s) => ({ s, n: Number(totals.by_status?.[s]) || 0 }));

  const stats = [
    { label: t("Open records"), value: Number(totals.open) || 0, href: "/records?open=1", alert: false },
    { label: t(isCentral(me) ? "Overdue" : "Late in all offices"), ...(isCentral(me) ? {} : { hint: t("Late records in every office you can see") }), value: overdueTotal, alert: overdueTotal > 0, href: "/records?overdue=1" },
    ...(officeHref ? [{ label: t("In my office"), value: officeTotal, href: officeHref, alert: false }] : []),
    { label: t("Logged this month"), value: Number(totals.this_month) || 0, href: `/records?from=${monthFrom}`, alert: false },
  ];

  const calItems = open
    .filter((r) => r.due_date)
    .map((r) => ({ id: r.id, tracking_no: r.tracking_no, subject: r.subject, due_date: r.due_date!.slice(0, 10), office: r.current_office?.name ?? null }));

  const RecordRow = ({ r, hint }: { r: Row; hint: string | null }) => {
    const late = isOverdue(r.due_date, r.status);
    return (
      <li>
        <Link prefetch={false} href={`/records/${r.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-brand-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
          <span className="min-w-0 break-words font-semibold text-ink">{r.subject}</span>
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
              t("Logged {date}", { date: fmtDate(r.created_at, lang) })
            )}
            {hint ? ` · ${hint}` : ""}
          </span>
        </Link>
      </li>
    );
  };

  const DeskList = ({ id, title, count, list, empty, hint, more, className }: {
    id: string; title: string; count?: string; list: Row[]; empty: string; hint?: (r: Row) => string | null;
    more?: { href: string; n: string } | null; className: string;
  }) => (
    <section className={`card min-w-0 lg:self-start ${className}`} aria-labelledby={id}>
      <h2 id={id} className="border-b border-line px-4 py-3 text-lg font-bold sm:px-5">
        {title}
        {count !== undefined && <> <span className="font-normal text-slate-600">({count})</span></>}
      </h2>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((r) => <RecordRow key={r.id} r={r} hint={hint?.(r) ?? null} />)}
        </ul>
      )}
      {more && (
        <p className="border-t border-line px-4 py-3 sm:px-5">
          <Link prefetch={false} href={more.href} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See all {n}", { n: more.n })}</Link>
        </p>
      )}
    </section>
  );

  const capped = rows.length >= 500;
  const showCal = sp.cal === "month";
  const name = greetingName(me.full_name);
  const calendarBlock = (
    <div className="min-w-0 space-y-4">
      <Link prefetch={false} href={showCal ? "/" : "/?cal=month"} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4">
        {t(showCal ? "Hide month calendar" : "Show month calendar")}
      </Link>
      {showCal && <DueCalendar today={today} lateTotal={overdueTotal} items={calItems} />}
    </div>
  );

  if (screen === "desk") {
    const lateGroups = lateByOffice(rows, today);
    const oldest = oldestGroup(lateGroups);
    const sampleLate = lateGroups.reduce((n, g) => n + g.count, 0);
    const lateNum = totalsError ? sampleLate : overdueTotal;
    const lateText = totalsError ? countText(sampleLate, capped) : String(overdueTotal);
    const { today: dueToday, week: dueWeek } = dueAgenda(rows, today);
    const ready = readyToSend(rows);
    const unboxed = notInBox(rows);
    const logged = loggedOn(rows, today);
    const waiting = sortNeedsAction(inbox, today).slice(0, 5);
    const waitingNum = totalsError ? inbox.length : officeTotal;
    const waitingText = totalsError ? countText(inbox.length, capped) : String(officeTotal);
    const readyHref = "/records?direction=outgoing&status=completed";
    let fact: string;
    if (lateNum === 0) fact = `${t("Good day, {name}.", { name })} ${t("No records are late.")}`;
    else if (!oldest) fact = lateNum === 1 ? t("Good day, {name}. 1 record is late.", { name }) : t("Good day, {name}. {n} records are late.", { name, n: lateText });
    else if (lateNum === 1) fact = t("Good day, {name}. 1 record is late; it is with {office}, late since {date}.", { name, office: oldest.name, date: fmtDate(oldest.since, lang) });
    else if (lateGroups.length === 1 && !capped) fact = t("Good day, {name}. {n} records are late, all with {office}; the oldest is late since {date}.", { name, n: lateText, office: oldest.name, date: fmtDate(oldest.since, lang) });
    else fact = t("Good day, {name}. {n} records are late in {offices} offices; the oldest is with {office}, late since {date}.", { name, n: lateText, offices: countText(lateGroups.length, capped), office: oldest.name, date: fmtDate(oldest.since, lang) });

    const deskStats = [
      { label: t("Late, all offices"), value: totalsError ? "—" : overdueTotal, href: "/records?overdue=1&open=1", alert: !totalsError && overdueTotal > 0 },
      { label: t("Waiting here"), value: totalsError ? "—" : officeTotal, href: officeHref ?? undefined, alert: false },
      { label: t("Ready to send out"), value: countText(ready.length, capped), href: readyHref, alert: false },
      { label: t("Logged today"), value: countText(logged, capped && logged === rows.length), href: `/records?from=${today}`, alert: false },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("Records Section")}</h1>
            <p className="mt-1 max-w-3xl break-words text-slate-700">{fact}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link prefetch={false} href="/records/new" className="btn-primary flex-1 sm:flex-none">{t("Register a record")}</Link>
            <div className="sm:order-first"><ScanQrButton /></div>
          </div>
        </div>

        <StatStrip label={t("Summary")} items={deskStats} />
        {totalsError && <p role="status" className="text-sm text-slate-700">{t("Totals did not load. The lists below are current.")}</p>}

        {mine.length > 0 && (
          <DeskList id="desk-mine" title={t("Assigned to me")} list={mine} empty="" className="" />
        )}

        <div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr_auto]">
          <DeskList
            id="desk-waiting"
            title={t("Waiting at the records desk")}
            list={waiting}
            hint={(r) => { const h = nextStepHint(r.status); return h ? t(h) : null; }}
            empty={t("Nothing waiting at the records desk.")}
            more={officeHref && waitingNum > 5 ? { href: officeHref, n: waitingText } : null}
            className={`lg:col-start-3 lg:row-start-1${waiting.length ? "" : " hidden lg:block"}`}
          />
          <section className="card min-w-0 lg:col-span-2 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:self-start" aria-labelledby="due-title">
            <h2 id="due-title" className="border-b border-line px-4 py-3 text-lg font-bold sm:px-5">{t("Due dates")}</h2>
            <h3 className="px-4 pt-4 pb-2 font-bold sm:px-5">{t("Late")} ({lateText})</h3>
            {lateNum === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-600 sm:px-5">{t("No records are late.")}</p>
            ) : lateGroups.length === 0 ? null : (
              <ul className="divide-y divide-line">
                {lateGroups.slice(0, 6).map((g) => (
                  <li key={g.code}>
                    <Link prefetch={false} href={`/records?office=${encodeURIComponent(g.code)}&here=1&overdue=1`} className="grid gap-1 px-4 py-3 hover:bg-brand-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
                      <span className="min-w-0 break-words font-semibold text-ink">{g.name}</span>
                      <span className="font-semibold text-red-700">{t("{n} late · since {date}", { n: g.count, date: fmtDate(g.since, lang) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {lateNum > 0 && (
              <p className="px-4 py-3 sm:px-5">
                <Link prefetch={false} href="/records?overdue=1&open=1" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See all {n}", { n: lateText })}</Link>
              </p>
            )}
            {dueToday.length > 0 && (
              <>
                <h3 className="border-t border-line px-4 pt-4 pb-2 font-bold sm:px-5">{t("Due today")} ({countText(dueToday.length, capped)})</h3>
                <ul className="divide-y divide-line">
                  {dueToday.slice(0, 6).map((r) => <RecordRow key={r.id} r={r} hint={null} />)}
                </ul>
              </>
            )}
            <h3 className="border-t border-line px-4 pt-4 pb-2 font-bold sm:px-5">{t("Due this week")} ({countText(dueWeek.length, capped)})</h3>
            {dueWeek.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-600 sm:px-5">{t("Nothing is due this week.")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {dueWeek.slice(0, 6).map((r) => <RecordRow key={r.id} r={r} hint={null} />)}
              </ul>
            )}
          </section>
          <DeskList
            id="desk-ready"
            title={t("Ready to send out")}
            count={countText(ready.length, capped)}
            list={ready.slice(0, 5)}
            empty={t("Nothing is ready to send out.")}
            more={ready.length > 5 ? { href: readyHref, n: countText(ready.length, capped) } : null}
            className="lg:col-start-3 lg:row-start-2"
          />
          <DeskList
            id="desk-unboxed"
            title={t("Not in a box yet")}
            count={countText(unboxed.length, capped)}
            list={unboxed.slice(0, 5)}
            empty={t("Every finished record is in a box.")}
            className="lg:col-start-3 lg:row-start-3"
          />
          <div className="min-w-0 space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-4">
            <Link prefetch={false} href={showCal ? "/" : "/?cal=month"} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4">
              {t(showCal ? "Hide month calendar" : "Show month calendar")}
            </Link>
            {showCal && <DueCalendar today={today} lateTotal={overdueTotal} items={calItems} />}
          </div>
        </div>
      </div>
    );
  }

  const code = me.office?.code ? encodeURIComponent(me.office.code) : null;
  const lateHereHref = code ? `/records?office=${code}&here=1&overdue=1&open=1` : "/records?overdue=1&open=1";
  const assignedBlock = mine.length > 0 && (
    <DeskList id="start-mine" title={t("Assigned to me")} count={String(mine.length)} list={mine.slice(0, 5)} empty="" className="" />
  );

  if (screen === "window") {
    const todayRows = (todayData ?? []) as unknown as Row[];
    const queue = windowQueue(todayRows, today, me.id, me.office_id);
    const waiting = sortNeedsAction(inbox, today);
    const queueText = countText(queue.length, todayRows.length >= OFFICE_CAP);
    const waitingText = totalsError ? countText(inbox.length, officeCapped) : String(officeTotal);
    const todayHref = `/records?from=${today}`;
    const windowStats = [
      { label: t("Received here today"), value: queueText, href: todayHref, alert: false },
      { label: t("Waiting in my office"), value: waitingText, href: officeHref ?? undefined, alert: false },
      { label: t("Late in all offices"), hint: t("Late records in every office you can see"), value: totalsError ? "—" : overdueTotal, href: "/records?overdue=1&open=1", alert: !totalsError && overdueTotal > 0 },
      { label: t("Assigned to me"), value: mine.length, href: undefined, alert: false },
    ];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("Office window")}</h1>
            <p className="mt-1 max-w-3xl break-words text-slate-700">
              {t("Good day, {name}. Received at this window today: {n}. Waiting in your office: {m}.", { name, n: queueText, m: waitingText })}
            </p>
            {me.office && <p className="text-sm text-slate-600">{me.office.name}</p>}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link prefetch={false} href="/records/new" className="btn-primary flex-1 sm:flex-none">{t("Receive a walk-in")}</Link>
            <div className="sm:order-first"><ScanQrButton /></div>
          </div>
        </div>

        <StatStrip label={t("Summary")} items={windowStats} />
        {totalsError && <p role="status" className="text-sm text-slate-700">{t("Totals did not load. The lists below are current.")}</p>}

        <div className="grid gap-6 lg:grid-cols-3">
          <DeskList
            id="window-queue"
            title={t("Today's queue")}
            count={queueText}
            list={queue.slice(0, 8)}
            hint={(r) => { const h = nextStepHint(r.status); return h ? t(h) : null; }}
            empty={t("Nothing received at this window today.")}
            more={queue.length > 8 ? { href: todayHref, n: queueText } : null}
            className="lg:col-span-2"
          />
          <div className="min-w-0 space-y-6 lg:self-start">
            <DeskList
              id="window-waiting"
              title={t("Waiting in my office")}
              list={waiting.slice(0, 5)}
              hint={(r) => { const h = nextStepHint(r.status); return h ? t(h) : null; }}
              empty={t("Nothing waiting in your office.")}
              more={officeHref && waiting.length > 5 ? { href: officeHref, n: waitingText } : null}
              className=""
            />
            {assignedBlock}
          </div>
        </div>
        {calendarBlock}
      </div>
    );
  }

  if (screen === "head") {
    const decide = sortNeedsAction(needsDecision(inbox), today);
    const late = lateHere(inbox, today);
    const decideText = countText(decide.length, officeCapped);
    const lateText = countText(late.length, officeCapped);
    const headStats = [
      { label: t("Needs your decision"), value: decideText, href: officeHref ?? undefined, alert: false },
      { label: t("Late in my office"), hint: t("Late records now in your office"), value: lateText, href: lateHereHref, alert: late.length > 0 },
      { label: t("In my office"), value: totalsError ? "—" : officeTotal, href: officeHref ?? undefined, alert: false },
      { label: t("Logged this month"), value: totalsError ? "—" : Number(totals.this_month) || 0, href: `/records?from=${monthFrom}`, alert: false },
    ];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("Good day, {name}", { name })}</h1>
            <p className="mt-1 max-w-3xl break-words text-slate-700">
              {decide.length === 0 && late.length === 0
                ? t("Nothing needs your decision and nothing is late in your office.")
                : t("Needs your decision: {n}. Late in your office: {m}.", { n: decideText, m: lateText })}
            </p>
            {me.office && <p className="text-sm text-slate-600">{me.office.name}</p>}
            {oversight && <div className="mt-3"><ScopeLinks base="/" scope="mine" /></div>}
          </div>
          <Link prefetch={false} href="/records/new" className="btn-primary w-full sm:w-auto">{t("Register a record")}</Link>
        </div>

        <StatStrip label={t("Summary")} items={headStats} />
        {totalsError && <p role="status" className="text-sm text-slate-700">{t("Totals did not load. The lists below are current.")}</p>}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <DeskList
              id="head-decide"
              title={t("Needs your decision")}
              count={decideText}
              list={decide.slice(0, 8)}
              hint={(r) => { const h = headHint(r); return h ? t(h) : null; }}
              empty={t("Nothing needs your decision.")}
              more={officeHref && decide.length > 8 ? { href: officeHref, n: decideText } : null}
              className=""
            />
            <DeskList
              id="head-late"
              title={t("Late in my office")}
              count={lateText}
              list={late.slice(0, 6)}
              empty={t("Nothing is late in your office.")}
              more={late.length > 6 ? { href: lateHereHref, n: lateText } : null}
              className=""
            />
          </div>
          <div className="min-w-0 space-y-6 lg:self-start">
            {assignedBlock}
            <section className="card" aria-labelledby="head-status">
              <h2 id="head-status" className="border-b border-line px-4 py-3 text-lg font-bold">{t("By status")}</h2>
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
        </div>
        {calendarBlock}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Good day, {name}", { name: greetingName(me.full_name) })}</h1>
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

      <StatStrip label={t("Summary")} items={stats} />

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

      {calendarBlock}
    </div>
  );
}
