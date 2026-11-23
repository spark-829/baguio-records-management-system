"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BARANGAYS, MAP_HEIGHT, MAP_WIDTH, steps } from "@/lib/baguio-map";
import { useT } from "@/lib/i18n/client";
import type { BarangayTally } from "@/lib/map-tally";

export type MapRecord = { id: string; tracking_no: string; subject: string; barangay: string; late: boolean; open: boolean };

// One green hue from light to dark, like public-health choropleth maps: darker means more records.
const SHADES = ["#d8eee0", "#a6d6b6", "#6fb98b", "#368f5d", "#14532d"];
const EMPTY = "#eef0f2";

// The downtown barangays are tiny on the whole-city view, so there is a "City center" zoom, like a map inset.
const VIEWS = {
  city: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
  center: "300 20 470 380",
} as const;


/**
 * Heat map of Baguio by barangay: how many records are addressed to or are about each one.
 * Pattern borrowed from choropleth maps (Google Maps, health dashboards): one-color scale with a legend,
 * point at a barangay to see its name and count, tap it to list its records, plus a ranked list
 * that works without a mouse and for people who find small map areas hard to tap.
 */
export function BarangayMap({ tally, picked, pickedList, onlyOpen }: { tally: BarangayTally; picked: string | null; pickedList: MapRecord[]; onlyOpen: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [view, setView] = useState<keyof typeof VIEWS>("city");

  const max = Math.max(0, ...Object.values(tally).map((v) => v.n));
  const legend = steps(max);
  const shade = (n: number) => {
    if (!n) return EMPTY;
    const i = legend.findIndex(([lo, hi]) => n >= lo && n <= hi);
    return SHADES[Math.round((i / Math.max(1, legend.length - 1)) * (SHADES.length - 1))];
  };
  const ranked = Object.entries(tally).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const count = (name: string) => tally[name]?.n ?? 0;
  function go(name: string | null) {
    const p = new URLSearchParams();
    if (onlyOpen) p.set("show", "open");
    if (name) p.set("b", name);
    start(() => router.push(`/map${p.size ? `?${p}` : ""}`, { scroll: false }));
  }
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
                  onClick={() => go(on ? null : b.name)}
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

      <section className={`card p-4${pending ? " opacity-60" : ""}`} aria-live="polite" aria-busy={pending}>
        <label className="label" htmlFor="bgy-pick">{t("Choose a barangay")}</label>
        <select id="bgy-pick" className="input" value={picked ?? ""} onChange={(e) => go(e.target.value || null)}>
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
              {label(count(picked))}
              {(tally[picked]?.late ?? 0) > 0 && ` · ${t("{n} late", { n: tally[picked]?.late ?? 0 })}`}
            </p>
            {count(picked) > pickedList.length && (
              <p className="text-sm text-slate-600">{t("Showing the first {n} of {total}.", { n: pickedList.length, total: count(picked) })}</p>
            )}
            {pickedList.length === 0 ? (
              <p className="mt-2 text-slate-700">{t("No records for this barangay.")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {pickedList.map((r) => (
                  <li key={r.id}>
                    <Link prefetch={false} href={`/records/${r.id}`} className="block min-h-12 py-2 hover:bg-brand-50">
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
            <button type="button" className="btn-secondary mt-3" onClick={() => go(null)}>
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
                {ranked.slice(0, 10).map(([name, v]) => (
                  <li key={name}>
                    <button type="button" onClick={() => go(name)} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 rounded px-1 text-left hover:bg-brand-50">
                      <span className="truncate text-brand-800 underline">{name}</span>
                      <span className="h-3 rounded bg-slate-100">
                        <span className="block h-3 rounded" style={{ width: `${(v.n / max) * 100}%`, background: shade(v.n) }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{v.n}</span>
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
