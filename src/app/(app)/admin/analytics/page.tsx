import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import {
  dayText, findingText, labelIndexes, niceTicks, parseFlow, pct, perWeek, periodDays, periodLabel, periodNoun, pileText,
  quintileCuts, quintileIndex, rankOffices, viewMode,
} from "@/lib/flow-analytics";
import type { Period, View } from "@/lib/flow-analytics";
import { SplitBar, StackBar, TrendChart } from "./charts";

export const metadata = { title: "System analytics" };

type SP = { days?: string | string[]; view?: string | string[] };

const MATRIX_FILL = ["bg-brand-50 text-ink", "bg-brand-100 text-ink", "bg-brand-200 text-ink", "bg-brand-600 text-white", "bg-brand-800 text-white"];
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
          className={`min-h-11 flex-1 inline-flex items-center justify-center px-3 text-center font-semibold no-underline ${l.current ? "bg-brand-700 text-white" : "border-2 border-brand-700 bg-white text-brand-800"}`}
        >
          {l.text}
        </Link>
      ))}
    </nav>
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
          {t("How records move through all offices: where they wait, for how long, and whether the offices are keeping up. Counts include every office.")}
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
  const topShare = top?.share || 1;
  const byId = new Map(data.offices.map((o) => [o.id, o]));
  const openById = new Map(data.openOffices.map((o) => [o.officeId, o]));
  const openMax = Math.max(1, ...data.openOffices.map((o) => o.under1w + o.w1to2 + o.w2to4 + o.over4w));

  const onTime = pct(strip.onTime, strip.withDue);
  const prevOnTime = pct(strip.prevOnTime, strip.prevWithDue);
  const cells = [
    { label: t("Usual time to finish"), value: dt(strip.medianFinish), prev: dt(strip.prevMedianFinish) },
    { label: t("Finished on time"), value: onTime === null ? "—" : `${onTime}%`, prev: prevOnTime === null ? "—" : `${prevOnTime}%` },
    { label: t("Open now"), value: String(data.openNow), prev: String(data.prevOpen) },
    { label: t("Finished per week"), value: String(perWeek(strip.finished, days)), prev: String(perWeek(strip.prevFinished, days)) },
  ];

  // Handoff matrix
  const matrixOffices = [...data.offices].sort((a, b) => a.code.localeCompare(b.code));
  const handoffMap = new Map(data.handoffs.map((h) => [`${h.from}|${h.to}`, h]));
  const handoffValue = (h: { sent: number; medianDays: number | null } | undefined) => (!h ? null : view === "sent" ? h.sent : h.medianDays);
  const cuts = quintileCuts(data.handoffs.map((h) => handoffValue(h) ?? 0));
  const cutText = (i: number) =>
    i === 0 ? t("up to {n}", { n: cuts[0] }) : i === 4 ? t("over {n}", { n: cuts[3] }) : `${cuts[i - 1]}–${cuts[i]}`;
  const listed = data.handoffs
    .filter((h) => handoffValue(h) !== null)
    .sort((a, b) => (handoffValue(b) ?? 0) - (handoffValue(a) ?? 0))
    .slice(0, 10);
  const oName = (id: string) => byId.get(id)?.name ?? "—";

  // Trend
  const trendMax = Math.max(0, ...data.trend.flatMap((p) => [p.logged, p.finished]));
  const ticks = niceTicks(trendMax);
  const labels = labelIndexes(data.trend.length).map((i) => ({ index: i, text: bucketLabel(data.trend[i].start, data.grain) }));
  const pile = pileText(data.logged, strip.finished);

  const returnsPct = pct(data.returns.recordsReturned, data.returns.recordsMoved);
  const viewLinks = [
    { href: `/admin/analytics?days=${days}&view=sent`, text: t("Records sent"), current: view === "sent" },
    { href: `/admin/analytics?days=${days}&view=days`, text: t("Days to receive"), current: view === "days" },
  ];
  const th = "px-3 py-2 font-semibold";

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
            <span className="block text-xl font-semibold tabular-nums text-brand-900">{c.value}</span>
            <span className="block text-sm text-slate-600">{t("Previous {period}: {value}", { period: noun, value: c.prev })}</span>
          </div>
        ))}
      </section>

      {/* 1. Where records wait longest */}
      <section className="card" aria-labelledby="wait-title">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 id="wait-title" className="text-lg font-bold">{t("Where records wait longest")}</h2>
          <p className="max-w-prose text-sm text-slate-600">
            {t("Offices ranked by their share of all the time records spent waiting in the last {period}. The dark part is time on the office's desk; the light part is time between being sent and being received.", { period: noun })}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-6 bg-brand-700" />{t("On the desk")}</span>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-6 border border-brand-700 bg-brand-200" />{t("Sent, not yet received")}</span>
          </p>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th scope="col" className={`${th} sticky left-0 min-w-[12rem] bg-slate-50`}>{t("Office")}</th>
                <th scope="col" className={th}>{t("Share of all waiting")}</th>
                <th scope="col" className={th}>{t("Usual wait")}</th>
                <th scope="col" className={th}>{t("9 in 10 leave within")}</th>
                <th scope="col" className={th}>{t("Usually takes to receive")}</th>
                <th scope="col" className={th}>{t("Records that passed through")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranked.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className="sticky left-0 min-w-[12rem] bg-white px-3 py-2 text-left font-normal focus-within:z-10">
                    <Link prefetch={false} href={`/records?office=${encodeURIComponent(o.code)}`} className="font-semibold text-brand-700 underline">{o.name}</Link>
                  </th>
                  {o.visits === 0 ? (
                    <td colSpan={5} className="px-3 py-2 text-slate-600">{t("No records in this period")}</td>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-3">
                          <SplitBar deskPct={(o.deskPct / topShare) * 100} transitPct={(o.transitPct / topShare) * 100} widthClass="w-40" />
                          <span className="font-semibold tabular-nums">{Math.round(o.share)}%</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">{dt(o.medianWait)}</td>
                      <td className="px-3 py-2">{dt(o.p90Wait)}</td>
                      <td className="px-3 py-2">{dt(o.medianHandoff)}</td>
                      <td className="px-3 py-2 tabular-nums">{o.records}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="divide-y divide-line md:hidden">
          {ranked.map((o) => (
            <li key={o.id} className="space-y-1 px-4 py-3">
              <p className="font-semibold">{o.name}</p>
              {o.visits === 0 ? (
                <p className="text-sm text-slate-600">{t("No records in this period")}</p>
              ) : (
                <>
                  <SplitBar deskPct={(o.deskPct / topShare) * 100} transitPct={(o.transitPct / topShare) * 100} widthClass="w-full" />
                  <p className="text-sm text-slate-600">
                    {t("{share}% of waiting · usual wait {wait} · 9 in 10 within {p90}", { share: Math.round(o.share), wait: dt(o.medianWait), p90: dt(o.p90Wait) })}
                  </p>
                </>
              )}
            </li>
          ))}
        </ol>
        <p className="border-t border-line px-4 py-3 text-sm text-slate-600 sm:px-5">{t("— means fewer than 5 records, too few to say.")}</p>
      </section>

      {/* 2. How long open records have waited */}
      <section className="card" aria-labelledby="open-title">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 id="open-title" className="text-lg font-bold">{t("How long open records have waited")}</h2>
          <p className="max-w-prose text-sm text-slate-600">{t("Records open right now, by time in their current office. Not affected by the period above.")}</p>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-6 ${b.className}`} />{t(b.label)}</span>
            ))}
          </p>
        </div>
        {data.openNow === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t("No open records right now.")}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th scope="col" className={`${th} min-w-[12rem]`}>{t("Office")}</th>
                    <th scope="col" className={`${th} w-64`}><span className="sr-only">{t("Bar")}</span></th>
                    {BUCKETS.map((b) => <th key={b.key} scope="col" className={th}>{t(b.label)}</th>)}
                    <th scope="col" className={th}>{t("Past due date")}</th>
                    <th scope="col" className={th}>{t("Oldest")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ranked.map((o) => {
                    const r = openById.get(o.id);
                    return (
                      <tr key={o.id}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">{o.name}</th>
                        <td className="px-3 py-2">
                          <StackBar max={openMax} parts={BUCKETS.map((b) => ({ n: r?.[b.key] ?? 0, className: b.className }))} />
                        </td>
                        {BUCKETS.map((b) => <td key={b.key} className="px-3 py-2 tabular-nums">{r?.[b.key] ?? 0}</td>)}
                        <td className={`px-3 py-2 tabular-nums ${r && r.pastDue > 0 ? "font-semibold text-red-700" : ""}`}>{r?.pastDue ?? 0}</td>
                        <td className="px-3 py-2">
                          {r?.oldest ? (
                            <>
                              <Link prefetch={false} href={`/records/${r.oldest.id}`} className="font-mono text-brand-700 underline">{r.oldest.trackingNo}</Link>
                              <span className="block text-slate-600">{dt(r.oldest.days)}</span>
                            </>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {ranked.map((o) => {
                const r = openById.get(o.id);
                return (
                  <li key={o.id} className="space-y-1 px-4 py-3">
                    <p className="font-semibold">{o.name}</p>
                    <StackBar max={openMax} parts={BUCKETS.map((b) => ({ n: r?.[b.key] ?? 0, className: b.className }))} />
                    <p className="text-sm text-slate-600">
                      {t("Over 4 weeks: {n} · Past due: {due} · Oldest: {oldest}", { n: r?.over4w ?? 0, due: r?.pastDue ?? 0, oldest: r?.oldest ? dt(r.oldest.days) : "—" })}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* 3. Handoffs */}
      <section className="card" aria-labelledby="handoff-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div>
            <h2 id="handoff-title" className="text-lg font-bold">{t("Handoffs between offices")}</h2>
            <p className="max-w-prose text-sm text-slate-600">
              {t("How many records each office sent to each other office in the last {period}, or how long the receiving office usually took to receive them.", { period: noun })}
            </p>
          </div>
          <Group label={t("View")} links={viewLinks} />
        </div>
        {data.handoffs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t("No records moved between offices in this period.")}</p>
        ) : (
          <>
            <div className="hidden space-y-3 px-4 py-3 sm:px-5 md:block">
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="px-2 py-2 text-left font-semibold text-slate-600">{t("From (rows), to (columns)")}</th>
                      {matrixOffices.map((o) => (
                        <th key={o.id} scope="col" className="px-2 py-2 text-center font-semibold"><abbr title={o.name}>{o.code}</abbr></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixOffices.map((from) => (
                      <tr key={from.id}>
                        <th scope="row" className="px-2 py-1 text-left font-semibold"><abbr title={from.name}>{from.code}</abbr></th>
                        {matrixOffices.map((to) => {
                          if (from.id === to.id) return <td key={to.id} className="border border-line px-2 py-2 text-center text-slate-600">—</td>;
                          const h = handoffMap.get(`${from.id}|${to.id}`);
                          const v = handoffValue(h);
                          const fill = v && v > 0 ? MATRIX_FILL[quintileIndex(v, cuts)] : "bg-white text-slate-600";
                          return (
                            <td key={to.id} className={`border border-line px-2 py-2 text-center tabular-nums ${fill}`}>
                              {v === null ? (view === "sent" ? "0" : "—") : view === "sent" ? v : v.toFixed(1)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cuts.length === 4 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>{t("Lighter = fewer or faster · Darker = more or slower")}</span>
                  {MATRIX_FILL.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className={`inline-block h-4 w-6 border border-line ${f.split(" ")[0]}`} />
                      {cutText(i)}
                    </span>
                  ))}
                </div>
              )}
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {matrixOffices.map((o) => (
                  <div key={o.id} className="flex gap-2"><dt className="font-semibold">{o.code}</dt><dd className="text-slate-600">{o.name}</dd></div>
                ))}
              </dl>
            </div>
            <div className="md:hidden">
              <h3 className="px-4 pt-3 font-semibold">{t(view === "sent" ? "Busiest handoffs" : "Slowest handoffs")}</h3>
              <ol className="divide-y divide-line">
                {listed.map((h, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <span>{t("From {from} to {to}", { from: oName(h.from), to: oName(h.to) })}</span>
                    <span className="font-semibold tabular-nums">
                      {view === "sent" ? t(h.sent === 1 ? "{n} record" : "{n} records", { n: h.sent }) : dt(h.medianDays)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>

      {/* 4. Is the system keeping up? */}
      <section className="card" aria-labelledby="trend-title">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 id="trend-title" className="text-lg font-bold">{t("Is the system keeping up?")}</h2>
          <p className="mt-1 text-lg font-semibold">{t(pile.key, pile.vars)}</p>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block w-6 border-t-2 border-brand-700" />{t("Logged")}</span>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block w-6 border-t-2 border-dashed border-slate-600" />{t("Finished")}</span>
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <TrendChart points={data.trend} ticks={ticks} labels={labels} names={{ logged: t("Logged"), finished: t("Finished") }} />
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-700 underline">{t("Show the numbers")}</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th scope="col" className={th}>{t("Period")}</th>
                    <th scope="col" className={th}>{t("Logged")}</th>
                    <th scope="col" className={th}>{t("Finished")}</th>
                    <th scope="col" className={th}>{t("Difference")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.trend.map((p) => (
                    <tr key={p.start}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">{bucketLabel(p.start, data.grain)}</th>
                      <td className="px-3 py-2 tabular-nums">{p.logged}</td>
                      <td className="px-3 py-2 tabular-nums">{p.finished}</td>
                      <td className="px-3 py-2 tabular-nums">{p.logged - p.finished > 0 ? "+" : ""}{p.logged - p.finished}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      {/* 5. Records sent back */}
      <section className="card" aria-labelledby="back-title">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 id="back-title" className="text-lg font-bold">{t("Records sent back")}</h2>
          {data.returns.recordsReturned > 0 && returnsPct !== null && (
            <>
              <p className="mt-1 text-lg font-semibold">
                {t("{p}% of records went back to an office they had already left ({n} records).", { p: returnsPct, n: data.returns.recordsReturned })}
              </p>
              <p className="text-sm text-slate-600">{t("Each return adds another wait. Offices that received the most returns are listed first.")}</p>
            </>
          )}
        </div>
        {data.returns.recordsReturned === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t("No records were sent back in this period.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th scope="col" className={`${th} min-w-[12rem]`}>{t("Office")}</th>
                  <th scope="col" className={th}>{t("Returns received")}</th>
                  <th scope="col" className={th}>{t("Share of its arrivals")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.returns.offices.map((o) => (
                  <tr key={o.officeId}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">{oName(o.officeId)}</th>
                    <td className="px-3 py-2 tabular-nums">{o.returns}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(o.returns, o.arrivals) ?? "—"}{pct(o.returns, o.arrivals) === null ? "" : "%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
