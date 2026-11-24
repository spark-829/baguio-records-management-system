/** Server-rendered chart marks for System analytics. No client JS, no chart library; every mark is aria-hidden and its numbers sit in text or a table. */

/** One bar split into "on the desk" (dark) and "sent, not yet received" (light with an edge). Percentages are relative to the track. */
export function SplitBar({ deskPct, transitPct, widthClass }: { deskPct: number; transitPct: number; widthClass: string }) {
  return (
    <span aria-hidden="true" className={`flex h-3 gap-[2px] bg-white ${widthClass}`}>
      <span className="block h-3 bg-brand-700" style={{ width: deskPct + "%" }} />
      <span className="block h-3 border border-brand-700 bg-brand-200" style={{ width: transitPct + "%" }} />
    </span>
  );
}

/** Stacked bar on a shared scale: each part's width is its count out of `max`. */
export function StackBar({ parts, max }: { parts: { n: number; className: string }[]; max: number }) {
  return (
    <span aria-hidden="true" className="flex h-3 w-full gap-[2px] bg-white">
      {parts.map((p, i) => (p.n > 0 ? <span key={i} className={`block h-3 ${p.className}`} style={{ width: (max ? (p.n / max) * 100 : 0) + "%" }} /> : null))}
    </span>
  );
}

/** Two straight lines (logged solid, finished dashed). Tick and axis text is HTML so it never stretches. */
export function TrendChart({
  points,
  ticks,
  labels,
  names,
}: {
  points: { logged: number; finished: number }[];
  ticks: number[];
  labels: { index: number; text: string }[];
  names: { logged: string; finished: string };
}) {
  const top = ticks[ticks.length - 1] || 1;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const line = (key: "logged" | "finished") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const last = points[n - 1] ?? { logged: 0, finished: 0 };
  let yLogged = y(last.logged);
  let yFinished = y(last.finished);
  if (Math.abs(yLogged - yFinished) < 12) {
    if (yLogged <= yFinished) yFinished = yLogged + 12;
    else yLogged = yFinished + 12;
  }
  return (
    <div aria-hidden="true" className="grid grid-cols-[2.5rem_1fr_6rem] gap-x-2">
      <div className="relative h-[200px]">
        {ticks.map((v) => (
          <span key={v} className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-slate-600" style={{ top: y(v) + "%" }}>{v}</span>
        ))}
      </div>
      <div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="h-[200px] w-full">
          {ticks.map((v) => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <polyline points={line("logged")} fill="none" stroke="var(--color-brand-700)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <polyline points={line("finished")} fill="none" stroke="#475569" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative mt-1 h-6">
          {labels.map((l, i) => (
            <span
              key={l.index}
              className={`absolute whitespace-nowrap text-xs text-slate-600 ${i === 0 && l.index === 0 ? "" : l.index === n - 1 && n > 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: x(l.index) + "%" }}
            >
              {l.text}
            </span>
          ))}
        </div>
      </div>
      <div className="relative h-[200px]">
        <span className="absolute -translate-y-1/2 text-xs font-semibold text-brand-800" style={{ top: yLogged + "%" }}>{names.logged}</span>
        <span className="absolute -translate-y-1/2 text-xs font-semibold text-slate-600" style={{ top: yFinished + "%" }}>{names.finished}</span>
      </div>
    </div>
  );
}
