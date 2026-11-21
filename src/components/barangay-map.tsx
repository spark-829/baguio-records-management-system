"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BARANGAYS, MAP_HEIGHT, MAP_WIDTH } from "@/lib/baguio-map";
import { useT } from "@/lib/i18n/client";

export type MapRecord = { id: string; tracking_no: string; subject: string; barangay: string; late: boolean; open: boolean };

// One green hue from light to dark, like public-health choropleth maps: darker means more records.
const SHADES = ["#d8eee0", "#a6d6b6", "#6fb98b", "#368f5d", "#14532d"];
const EMPTY = "#eef0f2";

// The downtown barangays are tiny on the whole-city view, so there is a "City center" zoom, like a map inset.
const VIEWS = {
  city: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  center: "300 20 470 380",
} as const;

/** Five steps from 1 to the busiest barangay, so the legend always reads in whole numbers. */
export function steps(max: number): [number, number][] {
  const tops = [...new Set([0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.max(1, Math.round(max * f))))];
  return max < 1 ? [] : tops.map((hi, i) => [i === 0 ? 1 : tops[i - 1] + 1, hi]);
}

/**
 * Heat map of Baguio by barangay: how many records are addressed to or are about each one.
 * Pattern borrowed from choropleth maps (Google Maps, health dashboards): one-color scale with a legend,
 * point at a barangay to see its name and count, tap it to list its records, plus a ranked list
 * that works without a mouse and for people who find small map areas hard to tap.
 */
export function BarangayMap({ records }: { records: MapRecord[] }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [view, setView] = useState<keyof typeof VIEWS>("city");

  const byName = useMemo(() => {
    const m = new Map<string, MapRecord[]>();
    for (const r of records) m.set(r.barangay, [...(m.get(r.barangay) ?? []), r]);
    return m;
  }, [records]);
  const max = Math.max(0, ...[...byName.values()].map((l) => l.length));
  const legend = steps(max);
  const shade = (n: number) => {
    if (!n) return EMPTY;
    const i = legend.findIndex(([lo, hi]) => n >= lo && n <= hi);
    return SHADES[Math.round((i / Math.max(1, legend.length - 1)) * (SHADES.length - 1))];
  };
  const ranked = [...byName.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const pickedList = picked ? byName.get(picked) ?? [] : [];
  const count = (name: string) => byName.get(name)?.length ?? 0;
  const label = (n: number) => t(n === 1 ? "{n} record" : "{n} records", { n });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label={t("What the colors mean")}>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-4 w-4 rounded border border-slate-300" style={{ background: EMPTY }} aria-hidden />
              {t("None")}
            </li>
            {legend.map(([lo, hi]) => (
              <li key={lo} className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded" style={{ background: shade(lo) }} aria-hidden />
                {lo === hi ? lo : `${lo}–${hi}`}
              </li>
            ))}
          </ul>
          <div role="group" aria-label={t("Map view")} className="inline-flex rounded-lg border-2 border-brand-700 p-0.5">
            {(["city", "center"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-10 rounded-md px-3 text-sm font-semibold ${view === v ? "bg-brand-700 text-white" : "text-brand-800 hover:bg-brand-50"}`}
              >
                {t(v === "city" ? "Whole city" : "City center")}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-3">
          <svg
            viewBox={VIEWS[view]}
            className="h-auto w-full touch-manipulation"
            role="img"
            aria-label={t("Map of Baguio City by barangay. Use the list beside it to choose a barangay.")}
            onMouseLeave={() => setHover(null)}
          >
            {BARANGAYS.map((b) => {
              const n = count(b.name);
              const on = picked === b.name;
              return (
                <path
                  key={b.name}
                  d={b.d}
                  fill={shade(n)}
                  stroke={on ? "#111827" : "#ffffff"}
                  strokeWidth={on ? 3 : view === "center" ? 0.8 : 1.2}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => setPicked(on ? null : b.name)}
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover({ name: b.name, x: e.clientX - box.left, y: e.clientY - box.top });
                  }}
                >
                  <title>{`${b.name}: ${label(n)}`}</title>
                </path>
              );
            })}
            {/* Draw the chosen barangay again on top so its dark outline is not hidden by its neighbours */}
            {picked && BARANGAYS.filter((b) => b.name === picked).map((b) => <path key="sel" d={b.d} fill="none" stroke="#111827" strokeWidth={3} pointerEvents="none" />)}
          </svg>
          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"
              style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}
              aria-hidden
            >
              <div className="font-semibold">{hover.name}</div>
              <div>{label(count(hover.name))}</div>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-600">{t("Tap a barangay to see its records. Darker means more records.")}</p>
      </section>

      <section className="card p-4" aria-live="polite">
        <label className="label" htmlFor="bgy-pick">{t("Choose a barangay")}</label>
        <select id="bgy-pick" className="input" value={picked ?? ""} onChange={(e) => setPicked(e.target.value || null)}>
          <option value="">{t("All barangays")}</option>
          {BARANGAYS.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name} ({count(b.name)})
            </option>
          ))}
        </select>

        {picked ? (
          <>
            <h2 className="mt-4 text-lg font-bold">{picked}</h2>
            <p className="text-slate-700">
              {label(pickedList.length)}
              {pickedList.some((r) => r.late) && ` · ${t("{n} late", { n: pickedList.filter((r) => r.late).length })}`}
            </p>
            {pickedList.length === 0 ? (
              <p className="mt-2 text-slate-700">{t("No records for this barangay.")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {pickedList.map((r) => (
                  <li key={r.id}>
                    <Link href={`/records/${r.id}`} className="block min-h-12 py-2 hover:bg-brand-50">
                      <span className="block font-medium">{r.subject}</span>
                      <span className="block text-sm text-slate-600">
                        <span className="font-mono">{r.tracking_no}</span>
                        {r.late ? <span className="font-semibold text-red-700"> · {t("Late")}</span> : r.open ? ` · ${t("Still being handled")}` : ` · ${t("Finished")}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-secondary mt-3" onClick={() => setPicked(null)}>
              {t("Show all barangays")}
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-lg font-bold">{t("Barangays with the most records")}</h2>
            {ranked.length === 0 ? (
              <p className="mt-2 text-slate-700">{t("No records have a barangay yet.")}</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {ranked.slice(0, 10).map(([name, list]) => (
                  <li key={name}>
                    <button type="button" onClick={() => setPicked(name)} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 rounded px-1 text-left hover:bg-brand-50">
                      <span className="truncate text-brand-800 underline">{name}</span>
                      <span className="h-3 rounded bg-slate-100">
                        <span className="block h-3 rounded" style={{ width: `${(list.length / max) * 100}%`, background: shade(list.length) }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{list.length}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}
