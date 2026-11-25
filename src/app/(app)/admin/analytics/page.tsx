import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import {
  dayText, findingText, fullBuckets, kpiCompare, labelIndexes, niceTicks, openPile, parseFlow, pct, perWeek, periodDays, periodLabel, periodNoun, pileText,
  rankOffices, topWithOther, viewMode,
} from "@/lib/flow-analytics";
import type { Period, View } from "@/lib/flow-analytics";
import { BarList, OpenLine, PairedColumns } from "./charts";

export const metadata = { title: "System analytics" };

type SP = { days?: string | string[]; view?: string | string[] };

const DESK = "bg-brand-700";
const TRANSIT = "border border-brand-700 bg-brand-200";
const TOP_N = 6;
const BUCKETS = [
  { key: "under1w", label: "Under 1 week", className: "border border-brand-700 bg-brand-100" },
  { key: "w1to2", label: "1 to 2 weeks", className: "bg-brand-200" },
  { key: "w2to4", label: "2 to 4 weeks", className: "bg-brand-600" },
  { key: "over4w", label: "Over 4 weeks", className: "bg-brand-900" },
] as const;

function Group({ label, links }: { label: string; links: { href: string; text: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex w-full md:w-auto">
      {links.map((l) => (
        <Link
          key={l.href}
          prefetch={false}
          href={l.href}
          aria-current={l.current ? "page" : undefined}
          className={`min-h-11 flex-1 inline-flex items-center justify-center border-2 border-brand-700 px-3 text-center font-semibold no-underline md:flex-none md:px-4 md:whitespace-nowrap ${l.current ? "bg-brand-700 text-white" : "bg-white text-brand-800"}`}
        >
          {l.text}
        </Link>
      ))}
    </nav>
  );
}

function ScrollBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto">
      {children}
    </div>
  );
}

function bucketLabel(start: string, grain: "week" | "month") {
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat("en-PH", grain === "month" ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" }).format(date);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const sp = await searchParams;
  const days: Period = periodDays(sp.days);
  const view: View = viewMode(sp.view);
  const supabase = await createClient();
  const { data: raw, error } = await supabase.rpc("rms_admin_flow_analytics", { p_days: days });
  if (error) console.error("rms_admin_flow_analytics failed", error.message);
  const data = error ? null : parseFlow(raw);

  const here = `/admin/analytics?days=${days}&view=${view}`;
  const noun = t(periodNoun(days));
  const dt = (x: number | null) => {
    const r = dayText(x);
    return r ? t(r.key, r.vars) : "—";
  };

  const periodLinks = ([30, 90, 365] as const).map((d) => ({ href: `/admin/analytics?days=${d}&view=${view}`, text: t(periodLabel(d)), current: d === days }));

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-2xl font-bold">{t("System analytics")}</h1>
        <p className="mt-1 max-w-prose text-slate-600">
          {t("Where records get stuck, and whether the offices are keeping up. Counts include every office.")}
        </p>
        {data && <p className="mt-1 text-sm text-slate-600">{t("Figures as of {time}", { time: fmtDateTime(data.asOf) })}</p>}
      </div>
      <Group label={t("Period")} links={periodLinks} />
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800">{t("System analytics could not load. Try again in a minute.")}</p>
          <Link href={here} className="btn-secondary mt-3">{t("Try again")}</Link>
        </div>
      </div>
    );
  }

  const { strip } = data;
  const ranked = rankOffices(data.offices);
  const top = ranked[0];
  const finding = findingText(top);
  const byId = new Map(data.offices.map((o) => [o.id, o]));
  const oName = (id: string) => byId.get(id)?.name ?? "—";
  const openById = new Map(data.openOffices.map((o) => [o.officeId, o]));
  const plural = (n: number, one: string, many: string) => t(n === 1 ? one : many, { n });

  const onTime = pct(strip.onTime, strip.withDue);
  const prevOnTime = pct(strip.prevOnTime, strip.prevWithDue);
  const cells = [
    { label: t("Usual time to finish"), value: dt(strip.medianFinish), prev: dt(strip.prevMedianFinish), cmp: kpiCompare(strip.medianFinish, strip.prevMedianFinish, "lower") },
    { label: t("Finished on time"), value: onTime === null ? "—" : `${onTime}%`, prev: prevOnTime === null ? "—" : `${prevOnTime}%`, cmp: kpiCompare(onTime, prevOnTime, "higher") },
    { label: t("Open now"), value: String(data.openNow), prev: String(data.prevOpen), cmp: kpiCompare(data.openNow, data.prevOpen, "lower") },
    {
      label: t("Finished per week"),
      value: String(perWeek(strip.finished, days)),
      prev: String(perWeek(strip.prevFinished, days)),
      cmp: kpiCompare(perWeek(strip.finished, days) * 10, perWeek(strip.prevFinished, days) * 10, "higher"),
    },
  ];

  // A. Where records wait longest
  const waiting = ranked.filter((o) => o.visits > 0);
  const waitTop = topWithOther(waiting, TOP_N, "share");
  const noData = data.offices.length - waiting.length;
  const waitMax = Math.max(1, ...waitTop.top.map((o) => o.share), waitTop.other?.share ?? 0);

  // B. Open records
  const openRows = data.openOffices
    .map((o) => {
      const total = o.under1w + o.w1to2 + o.w2to4 + o.over4w;
      return { ...o, total, rank: (o.w2to4 + o.over4w) * 100000 + total };
    })
    .filter((o) => o.total > 0);
  const openTop = topWithOther(openRows.map((r) => ({ officeId: r.officeId, under1w: r.under1w, w1to2: r.w1to2, w2to4: r.w2to4, over4w: r.over4w, pastDue: r.pastDue, total: r.total, rank: r.rank })), TOP_N, "rank");
  const openMax = Math.max(1, ...openTop.top.map((o) => o.total), openTop.other?.total ?? 0);
  const overdueTotal = data.openOffices.reduce((a, o) => a + o.pastDue, 0);
  const oldest = data.openOffices.reduce<{ id: string; trackingNo: string; days: number; officeId: string } | null>(
    (best, o) => (o.oldest && (!best || o.oldest.days > best.days) ? { ...o.oldest, officeId: o.officeId } : best),
    null,
  );
  const noOpen = data.offices.length - openRows.length;
  const oldestParts = oldest
    ? t("Oldest: {tracking} at {office}, waiting {days}.", { tracking: "\u0001", office: oName(oldest.officeId), days: dt(oldest.days) }).split("\u0001")
    : [];

  // C. Keeping up
  const trend = fullBuckets(data.trend);
  const offset = data.trend.length > 2 ? 1 : 0;
  const pile = openPile(data.trend, data.openNow);
  const pileTicks = niceTicks(Math.max(0, ...pile));
  const pileLabels = labelIndexes(pile.length, 3).map((i) => ({
    index: i,
    text: bucketLabel(i < data.trend.length ? data.trend[i].start : data.asOf.slice(0, 10), data.grain),
  }));
  const colTicks = niceTicks(Math.max(0, ...trend.flatMap((p) => [p.logged, p.finished])));
  const colLabels = labelIndexes(trend.length, 4).map((i) => ({ index: i, text: bucketLabel(trend[i].start, data.grain) }));
  const pileLead = pileText(data.logged, strip.finished);
  const nothingMoved = data.logged === 0 && strip.finished === 0;
  const th = "px-3 py-2 font-semibold";

  // D. Handoffs
  const sortedSent = [...data.handoffs].sort((a, b) => b.sent - a.sent);
  const routes = (view === "sent" ? sortedSent : sortedSent.filter((h) => h.medianDays !== null).sort((a, b) => (b.medianDays ?? 0) - (a.medianDays ?? 0))).slice(0, TOP_N);
  const routeValue = (h: { sent: number; medianDays: number | null }) => (view === "sent" ? h.sent : h.medianDays ?? 0);
  const routeMax = Math.max(1, ...routes.map(routeValue));
  const viewLinks = [
    { href: `/admin/analytics?days=${days}&view=sent#handoffs`, text: t("Records sent"), current: view === "sent" },
    { href: `/admin/analytics?days=${days}&view=days#handoffs`, text: t("Days to receive"), current: view === "days" },
  ];

  // E. Sent back
  const returnsPct = pct(data.returns.recordsReturned, data.returns.recordsMoved);
  const returnRows = data.returns.offices.slice(0, 5);

  const officeLink = (code: string, name: string, query = "") => (
    <Link prefetch={false} href={`/records?office=${encodeURIComponent(code)}${query}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">
      {name}
    </Link>
  );
  const summaryCls = "inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-700 underline";
  const cardHead = "border-b border-line px-4 py-3 sm:px-5";
  const legend = "mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm";

  return (
    <div className="space-y-6">
      {header}

      <p className="text-lg font-semibold text-ink">
        {t(finding.key, {
          ...finding.vars,
          office: top?.name ?? "",
          period: noun,
          days: dt(top?.medianWait ?? null),
        })}
        {top && top.visits >= 5 && top.share > 0 && (
          <>
            {" "}
            <Link prefetch={false} href={`/records?office=${encodeURIComponent(top.code)}&here=1&open=1`} className="inline-flex min-h-11 items-center text-base font-semibold text-brand-700 underline">
              {t("See its open records")}
            </Link>
          </>
        )}
      </p>

      <section aria-label={t("Summary")} className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="bg-white px-4 py-3 sm:px-5 sm:py-4">
            <span className="text-sm font-semibold text-slate-600">{c.label}</span>
            <span className="block text-2xl font-semibold tabular-nums text-brand-900">{c.value}</span>
            <span className={`block text-sm ${c.cmp === "worse" ? "font-semibold text-amber-800" : "text-slate-600"}`}>
              {c.cmp === "better" && t("Better than the previous {period} ({value})", { period: noun, value: c.prev })}
              {c.cmp === "worse" && t("Worse than the previous {period} ({value})", { period: noun, value: c.prev })}
              {c.cmp === "same" && t("Same as the previous {period}", { period: noun })}
              {c.cmp === "none" && c.value !== "—" && t("No figures for the previous {period}", { period: noun })}
            </span>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* A. Where records wait longest */}
        <section className="card lg:col-span-6" aria-labelledby="wait-title">
          <div className={cardHead}>
            <h2 id="wait-title" className="text-lg font-bold">{t("Where records wait longest")}</h2>
            <p className="max-w-prose text-sm text-slate-600">
              {t("Share of all waiting time in the last {period}. Dark: on the office's desk. Light: sent but not yet received.", { period: noun })}
            </p>
            <p className={legend}>
              <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${DESK}`} />{t("On the desk")}</span>
              <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${TRANSIT}`} />{t("Sent, not yet received")}</span>
            </p>
          </div>
          <div className="space-y-3 px-4 py-3 sm:px-5">
            {waiting.length === 0 ? (
              <p className="text-sm text-slate-600">{t("Too few records moved in this period to rank offices. Try a longer period.")}</p>
            ) : (
              <>
                <BarList
                  max={waitMax}
                  rows={[
                    ...waitTop.top.map((o) => ({
                      key: o.id,
                      label: officeLink(o.code, o.name),
                      value: t("{share}% · usually {days}", { share: Math.round(o.share), days: dt(o.medianWait) }),
                      parts: [{ n: o.deskPct, className: DESK }, { n: o.transitPct, className: TRANSIT }],
                    })),
                    ...(waitTop.other
                      ? [{
                          key: "other",
                          label: <span className="inline-flex min-h-11 items-center">{plural(waitTop.other.count, "{n} other office", "{n} other offices")}</span>,
                          value: `${Math.round(waitTop.other.share)}%`,
                          parts: [{ n: waitTop.other.deskPct, className: DESK }, { n: waitTop.other.transitPct, className: TRANSIT }],
                        }]
                      : []),
                  ]}
                />
                {noData > 0 && <p className="text-sm text-slate-600">{plural(noData, "{n} office had no records in this period.", "{n} offices had no records in this period.")}</p>}
                <p className="text-sm text-slate-600">{t("— means fewer than 5 records, too few to say.")}</p>
                <details>
                  <summary className={summaryCls}>{t("Show the numbers")}</summary>
                  <ScrollBox label={t("Waiting time by office")}>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                          <th scope="col" className={`${th} sticky left-0 min-w-[12rem] bg-slate-50`}>{t("Office")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Share of all waiting")}</th>
                          <th scope="col" className={th}>{t("Usual wait")}</th>
                          <th scope="col" className={th}>{t("9 in 10 leave within")}</th>
                          <th scope="col" className={th}>{t("Usually takes to receive")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Records that passed through")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {ranked.map((o) => (
                          <tr key={o.id}>
                            <th scope="row" className="sticky left-0 min-w-[12rem] bg-white px-3 py-2 text-left font-normal focus-within:z-10">
                              <Link prefetch={false} href={`/records?office=${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{o.name}</Link>
                            </th>
                            {o.visits === 0 ? (
                              <td colSpan={5} className="px-3 py-2 text-slate-600">{t("No records in this period")}</td>
                            ) : (
                              <>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">{Math.round(o.share)}%</td>
                                <td className="px-3 py-2">{dt(o.medianWait)}</td>
                                <td className="px-3 py-2">{dt(o.p90Wait)}</td>
                                <td className="px-3 py-2">{dt(o.medianHandoff)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{o.records}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollBox>
                </details>
              </>
            )}
          </div>
        </section>

        {/* B. How long open records have waited */}
        <section className="card lg:col-span-6" aria-labelledby="open-title">
          <div className={cardHead}>
            <h2 id="open-title" className="text-lg font-bold">{t("How long open records have waited")}</h2>
            {data.openNow > 0 && (
              <p className="mt-1 font-semibold">
                {overdueTotal > 0 ? t("{n} open records are overdue.", { n: overdueTotal }) : t("No open records are overdue.")}
                {oldest && (
                  <>
                    {" "}
                    <span className="font-normal">
                      {oldestParts[0]}
                      <Link prefetch={false} href={`/records/${oldest.id}`} className="font-mono text-brand-700 underline">{oldest.trackingNo}</Link>
                      {oldestParts[1]}
                    </span>
                  </>
                )}
                {overdueTotal > 0 && (
                  <>
                    {" "}
                    <Link prefetch={false} href="/records?overdue=1&open=1" className="inline-flex min-h-11 items-center text-brand-700 underline">{t("See overdue records")}</Link>
                  </>
                )}
              </p>
            )}
            <p className="max-w-prose text-sm text-slate-600">{t("Right now, by time in their current office. The period above does not change this.")}</p>
            <p className={legend}>
              {BUCKETS.map((b) => (
                <span key={b.key} className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${b.className}`} />{t(b.label)}</span>
              ))}
            </p>
          </div>
          <div className="space-y-3 px-4 py-3 sm:px-5">
            {data.openNow === 0 || openRows.length === 0 ? (
              <p className="text-sm text-slate-600">{t("No open records right now.")}</p>
            ) : (
              <>
                <BarList
                  max={openMax}
                  rows={[
                    ...openTop.top.map((o) => ({
                      key: o.officeId,
                      label: officeLink(byId.get(o.officeId)?.code ?? "", oName(o.officeId), "&here=1&open=1"),
                      value: (
                        <>
                          {t("{total} open", { total: o.total })} ·{" "}
                          <span className={o.pastDue > 0 ? "font-semibold text-red-700" : ""}>{t("{n} overdue", { n: o.pastDue })}</span>
                        </>
                      ),
                      parts: BUCKETS.map((b) => ({ n: o[b.key], className: b.className })),
                    })),
                    ...(openTop.other
                      ? [{
                          key: "other",
                          label: <span className="inline-flex min-h-11 items-center">{plural(openTop.other.count, "{n} other office", "{n} other offices")}</span>,
                          value: (
                            <>
                              {t("{total} open", { total: openTop.other.total })} ·{" "}
                              <span className={openTop.other.pastDue > 0 ? "font-semibold text-red-700" : ""}>{t("{n} overdue", { n: openTop.other.pastDue })}</span>
                            </>
                          ),
                          parts: BUCKETS.map((b) => ({ n: openTop.other![b.key], className: b.className })),
                        }]
                      : []),
                  ]}
                />
                {noOpen > 0 && <p className="text-sm text-slate-600">{plural(noOpen, "{n} office has no open records.", "{n} offices have no open records.")}</p>}
                <details>
                  <summary className={summaryCls}>{t("Show the numbers")}</summary>
                  <ScrollBox label={t("Open records by office")}>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                          <th scope="col" className={`${th} min-w-[12rem]`}>{t("Office")}</th>
                          {BUCKETS.map((b) => <th key={b.key} scope="col" className={`${th} text-right`}>{t(b.label)}</th>)}
                          <th scope="col" className={`${th} text-right`}>{t("Overdue")}</th>
                          <th scope="col" className={th}>{t("Oldest")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {ranked.map((o) => {
                          const r = openById.get(o.id);
                          return (
                            <tr key={o.id}>
                              <th scope="row" className="px-3 py-2 text-left font-normal">{o.name}</th>
                              {BUCKETS.map((b) => <td key={b.key} className="px-3 py-2 text-right tabular-nums">{r?.[b.key] ?? 0}</td>)}
                              <td className={`px-3 py-2 text-right tabular-nums ${r && r.pastDue > 0 ? "font-semibold text-red-700" : ""}`}>{r?.pastDue ?? 0}</td>
                              <td className="px-3 py-2">
                                {r?.oldest ? (
                                  <>
                                    <Link prefetch={false} href={`/records/${r.oldest.id}`} className="inline-flex min-h-11 items-center font-mono text-brand-700 underline">{r.oldest.trackingNo}</Link>
                                    <span className="block text-slate-600">{dt(r.oldest.days)}</span>
                                  </>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ScrollBox>
                </details>
              </>
            )}
          </div>
        </section>

        {/* C. Is the system keeping up? */}
        <section className="card lg:col-span-12" aria-labelledby="trend-title">
          <div className={cardHead}>
            <h2 id="trend-title" className="text-lg font-bold">{t("Is the system keeping up?")}</h2>
            <p className="mt-1 text-lg font-semibold">{t(pileLead.key, pileLead.vars)}</p>
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {nothingMoved ? (
              <p className="text-sm text-slate-600">{t("Nothing was logged or finished in this period.")}</p>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="mb-3 font-semibold">{t("Open records over time")}</h3>
                    <OpenLine values={pile} ticks={pileTicks} labels={pileLabels} endLabel={t("{n} now", { n: data.openNow })} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t(data.grain === "month" ? "Logged and finished each month" : "Logged and finished each week")}</h3>
                    <p className="mb-3 mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${DESK}`} />{t("Logged")}</span>
                      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${TRANSIT}`} />{t("Finished")}</span>
                    </p>
                    <PairedColumns points={trend} ticks={colTicks} labels={colLabels} titles={{ logged: t("Logged"), finished: t("Finished") }} />
                  </div>
                </div>
                <p className="text-sm text-slate-600">{t(data.grain === "month" ? "Only whole months are shown." : "Only whole weeks are shown.")}</p>
                <details>
                  <summary className={summaryCls}>{t("Show the numbers")}</summary>
                  <ScrollBox label={t("Logged and finished by period")}>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                          <th scope="col" className={th}>{t("Period")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Logged")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Finished")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Difference")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Open at the end")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {trend.map((p, i) => (
                          <tr key={p.start}>
                            <th scope="row" className="px-3 py-2 text-left font-normal">{bucketLabel(p.start, data.grain)}</th>
                            <td className="px-3 py-2 text-right tabular-nums">{p.logged}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.finished}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.logged - p.finished > 0 ? "+" : ""}{p.logged - p.finished}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pile[i + offset + 1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollBox>
                </details>
              </>
            )}
          </div>
        </section>

        {/* D. Handoffs */}
        <section id="handoffs" className="card scroll-mt-4 lg:col-span-8" aria-labelledby="handoff-title">
          <div className={`flex flex-wrap items-start justify-between gap-3 ${cardHead}`}>
            <div>
              <h2 id="handoff-title" className="text-lg font-bold">{t("Handoffs between offices")}</h2>
              <p className="max-w-prose text-sm text-slate-600">
                {t("The routes records took most often in the last {period}, and how long the receiving office usually took to receive them.", { period: noun })}
              </p>
            </div>
            <Group label={t("View")} links={viewLinks} />
          </div>
          <div className="space-y-3 px-4 py-3 sm:px-5">
            {data.handoffs.length === 0 ? (
              <p className="text-sm text-slate-600">{t("No records moved between offices in this period.")}</p>
            ) : routes.length === 0 ? (
              <p className="text-sm text-slate-600">{t("No route had 5 or more records in this period.")}</p>
            ) : (
              <>
                <h3 className="font-semibold">{t(view === "sent" ? "Busiest routes" : "Slowest routes")}</h3>
                <BarList
                  max={routeMax}
                  rows={routes.map((h) => ({
                    key: `${h.from}|${h.to}`,
                    label: <span className="inline-flex min-h-11 items-center">{t("{from} to {to}", { from: oName(h.from), to: oName(h.to) })}</span>,
                    value: view === "sent" ? t(h.sent === 1 ? "{n} record" : "{n} records", { n: h.sent }) : dt(h.medianDays),
                    parts: [{ n: routeValue(h), className: "bg-brand-600" }],
                  }))}
                />
                {view === "days" && <p className="text-sm text-slate-600">{t("Only routes with 5 or more records are timed.")}</p>}
                <details>
                  <summary className={summaryCls}>{t("Show all routes")}</summary>
                  <ScrollBox label={t("All routes between offices")}>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                          <th scope="col" className={`${th} min-w-[10rem]`}>{t("From")}</th>
                          <th scope="col" className={`${th} min-w-[10rem]`}>{t("To")}</th>
                          <th scope="col" className={`${th} text-right`}>{t("Records sent")}</th>
                          <th scope="col" className={th}>{t("Usually received in")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {sortedSent.map((h) => (
                          <tr key={`${h.from}|${h.to}`}>
                            <th scope="row" className="px-3 py-2 text-left font-normal">{oName(h.from)}</th>
                            <td className="px-3 py-2">{oName(h.to)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{h.sent}</td>
                            <td className="px-3 py-2">{dt(h.medianDays)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollBox>
                </details>
              </>
            )}
          </div>
        </section>

        {/* E. Records sent back */}
        <section className="card lg:col-span-4" aria-labelledby="back-title">
          <div className={cardHead}>
            <h2 id="back-title" className="text-lg font-bold">{t("Records sent back")}</h2>
          </div>
          <div className="space-y-3 px-4 py-3 sm:px-5">
            {data.returns.recordsReturned === 0 || returnsPct === null ? (
              <p className="text-sm text-slate-600">{t("No records were sent back in this period.")}</p>
            ) : (
              <>
                <p>
                  <span className="text-2xl font-semibold tabular-nums text-brand-900">{returnsPct}%</span>{" "}
                  {t("of records went back to an office they had already left ({n} records).", { n: data.returns.recordsReturned })}
                </p>
                <p className="text-sm text-slate-600">{t("Each return adds another wait. Offices that received the most returns are listed first.")}</p>
                <ul className="divide-y divide-line">
                  {returnRows.map((o) => (
                    <li key={o.officeId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0 py-2">
                      <span className="font-semibold">{oName(o.officeId)}</span>
                      <span className="text-sm tabular-nums">{t(o.returns === 1 ? "{n} return · {p}% of its arrivals" : "{n} returns · {p}% of its arrivals", { n: o.returns, p: pct(o.returns, o.arrivals) ?? 0 })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
