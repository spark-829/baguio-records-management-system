import type { ReactNode } from "react";

/** Server-rendered chart marks for System analytics. No client JS, no chart library; every mark is aria-hidden and its numbers sit in text or a table. */

export interface BarRow {
  key: string;
  label: ReactNode;
  value: ReactNode;
  parts: { n: number; className: string }[];
}

/**
 * Ranked bar list. Each row: label line (office link on the left, value on the right) with the bar under it.
 * Parts are drawn on one shared scale (`max` = the full track), with a 2px white seam between them.
 */
export function BarList({ rows, max }: { rows: BarRow[]; max: number }) {
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0">
            <span className="min-w-0 font-semibold">{r.label}</span>
            <span className="text-sm tabular-nums">{r.value}</span>
          </div>
          <span aria-hidden="true" className="flex h-3 w-full gap-[2px] bg-white">
            {r.parts.map((p, i) =>
              p.n > 0 ? <span key={i} className={`block h-3 ${p.className}`} style={{ width: (max ? (p.n / max) * 100 : 0) + "%" }} /> : null,
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function YAxis({ ticks, top }: { ticks: number[]; top: number }) {
  return (
    <div className="relative h-[200px]">
      {ticks.map((v) => (
        <span key={v} className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-slate-600" style={{ top: 100 - (v / top) * 100 + "%" }}>
          {v}
        </span>
      ))}
    </div>
  );
}

function XLabels({ labels, n, center }: { labels: { index: number; text: string }[]; n: number; center: boolean }) {
  const x = (i: number) => (center ? ((i + 0.5) / n) * 100 : n <= 1 ? 50 : (i / (n - 1)) * 100);
  return (
    <div className="relative mt-1 h-6">
      {labels.map((l, i) => (
        <span
          key={l.index}
          className={`absolute whitespace-nowrap text-xs text-slate-600 ${!center && i === 0 && l.index === 0 ? "" : !center && l.index === n - 1 && n > 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
          style={{ left: x(l.index) + "%" }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}

/** One straight line over time, starting at 0 on the y axis. The end label ("{n} now") is HTML at the right. */
export function OpenLine({
  values,
  ticks,
  labels,
  endLabel,
}: {
  values: number[];
  ticks: number[];
  labels: { index: number; text: string }[];
  endLabel: string;
}) {
  const top = ticks[ticks.length - 1] || 1;
  const n = values.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const last = values[n - 1] ?? 0;
  return (
    <div aria-hidden="true" className="grid grid-cols-[2.5rem_1fr_4.5rem] gap-x-2">
      <YAxis ticks={ticks} top={top} />
      <div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="h-[200px] w-full">
          {ticks.map((v) => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--color-brand-700)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <XLabels labels={labels} n={n} center={false} />
      </div>
      <div className="relative h-[200px]">
        <span className="absolute -translate-y-1/2 text-xs font-semibold text-brand-800" style={{ top: Math.min(92, Math.max(8, y(last))) + "%" }}>
          {endLabel}
        </span>
      </div>
    </div>
  );
}

/** Clustered columns: logged (left, dark) and finished (right, light with an edge) per bucket. */
export function PairedColumns({
  points,
  ticks,
  labels,
  titles,
}: {
  points: { logged: number; finished: number }[];
  ticks: number[];
  labels: { index: number; text: string }[];
  titles: { logged: string; finished: string };
}) {
  const top = ticks[ticks.length - 1] || 1;
  const n = points.length;
  return (
    <div aria-hidden="true" className="grid grid-cols-[2.5rem_1fr] gap-x-2">
      <YAxis ticks={ticks} top={top} />
      <div>
        <div className="relative h-[200px]">
          {ticks.map((v) => (
            <span key={v} className="absolute inset-x-0 border-t border-line" style={{ top: 100 - (v / top) * 100 + "%" }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {points.map((p, i) => (
              <div key={i} className="flex h-full flex-1 items-end justify-center gap-[2px]">
                <span title={`${titles.logged}: ${p.logged}`} className="relative block w-full max-w-6 bg-brand-700" style={{ height: (p.logged / top) * 100 + "%" }} />
                <span title={`${titles.finished}: ${p.finished}`} className="relative block w-full max-w-6 border border-brand-700 bg-brand-200" style={{ height: (p.finished / top) * 100 + "%" }} />
              </div>
            ))}
          </div>
        </div>
        <XLabels labels={labels} n={n} center />
      </div>
    </div>
  );
}
