"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type Tone, toneOf, utc } from "@/lib/due";

export type DueItem = { id: string; tracking_no: string; subject: string; due_date: string; office: string | null };


const TONE: Record<Tone, { dot: string; text: string; label: string }> = {
  late: { dot: "bg-red-600", text: "text-red-800", label: "Late (overdue)" },
  soon: { dot: "bg-amber-500", text: "text-amber-900", label: "Due within 7 days" },
  ok: { dot: "bg-emerald-600", text: "text-emerald-800", label: "On track" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

const ymd = (d: Date) => d.toISOString().slice(0, 10);


/**
 * Month calendar of due dates (open records only), in the style of a family calendar app:
 * colored dots under each date, tap a date to see what is due that day.
 * Large cells and words beside every color, for older staff and color-blind users.
 */
export function DueCalendar({ items, today }: { items: DueItem[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7)); // "2026-11"
  const [picked, setPicked] = useState(today);

  const byDay = useMemo(() => {
    const m = new Map<string, DueItem[]>();
    for (const it of items) m.set(it.due_date, [...(m.get(it.due_date) ?? []), it]);
    return m;
  }, [items]);

  const first = utc(`${month}-01`);
  const start = new Date(first.getTime() - first.getUTCDay() * 864e5); // Sunday on or before the 1st
  const days = Array.from({ length: 42 }, (_, i) => ymd(new Date(start.getTime() + i * 864e5)));
  const weeks = days.slice(35).some((d) => d.startsWith(month)) ? 6 : 5;

  const shift = (n: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(ymd(d).slice(0, 7));
  };
  const lateCount = items.filter((i) => i.due_date < today).length;
  const pickedItems = byDay.get(picked) ?? [];
  // On today's date, also list what is still late from earlier days, so nothing is forgotten
  const stillLate = picked === today ? items.filter((i) => i.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date)) : [];

  return (
    <section className="card p-4" aria-labelledby="cal-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cal-title" className="text-lg font-bold">Due dates calendar</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <span className="min-w-40 text-center text-lg font-semibold" aria-live="polite">{MONTH.format(first)}</span>
          <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => shift(1)} aria-label="Next month">›</button>
          {month !== today.slice(0, 7) && (
            <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today); }}>
              Today
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="What the colors mean">
        {(Object.keys(TONE) as Tone[]).map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-full ${TONE[t].dot}`} aria-hidden />
            {t === "soon" ? <a href="#due-soon" className="underline">{TONE[t].label}</a> : TONE[t].label}
          </li>
        ))}
        {lateCount > 0 && <li className="text-slate-600">Tap today&apos;s date to also see everything that is late.</li>}
      </ul>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div role="group" aria-label={`Due dates, ${MONTH.format(first)}`}>
          <div className="grid grid-cols-7 border-b-2 border-brand-100 pb-1" aria-hidden>
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-sm font-semibold text-slate-600">{w}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7">
            {days.slice(0, weeks * 7).map((d) => {
                  const due = byDay.get(d) ?? [];
                  const inMonth = d.startsWith(month);
                  const tones = due.map((it) => toneOf(it.due_date, today));
                  const counts = (["late", "soon", "ok"] as Tone[]).map((t) => [t, tones.filter((x) => x === t).length] as const).filter(([, n]) => n);
                  const label = `${LONG_DAY.format(utc(d))}${d === today ? ", today" : ""}: ${due.length ? `${due.length} due` + (counts.length ? ` (${counts.map(([t, n]) => `${n} ${TONE[t].label.toLowerCase()}`).join(", ")})` : "") : "nothing due"}`;
                  return (
                    <div key={d} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => { setPicked(d); if (!inMonth) setMonth(d.slice(0, 7)); }}
                        aria-label={label}
                        aria-pressed={picked === d}
                        className={`flex h-14 w-full flex-col items-center justify-start rounded-lg pt-1 text-base sm:h-16 ${
                          picked === d ? "bg-brand-700 text-white" : d === today ? "bg-gold-100 ring-2 ring-gold-500" : "hover:bg-brand-50"
                        } ${inMonth ? "" : "opacity-40"}`}
                      >
                        <span className={`tabular-nums ${d === today ? "font-bold" : ""}`}>{Number(d.slice(8))}</span>
                        {due.length > 0 && (
                          <span className="mt-1 flex items-center gap-0.5" aria-hidden>
                            {counts.map(([t]) => (
                              <span key={t} className={`h-2.5 w-2.5 rounded-full ring-1 ring-white ${TONE[t].dot}`} />
                            ))}
                            {due.length > 1 && <span className={`ml-0.5 text-xs font-semibold ${picked === d ? "text-white" : "text-slate-700"}`}>{due.length}</span>}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
          </div>
        </div>

        <div aria-live="polite">
          <h3 className="text-base font-bold">
            {LONG_DAY.format(utc(picked))}
            {picked === today && " (today)"}
          </h3>
          {pickedItems.length === 0 ? (
            <p className="mt-2 text-slate-700">Nothing is due on this day. Tap a date with a dot to see what is due.</p>
          ) : (
            <Items list={pickedItems} today={today} />
          )}
          {stillLate.length > 0 && (
            <>
              <h3 className="mt-4 text-base font-bold text-red-800">Still late from earlier days ({stillLate.length})</h3>
              <Items list={stillLate.slice(0, 5)} today={today} showDate />
              {stillLate.length > 5 && (
                <Link href="/records?overdue=1" className="mt-1 inline-block py-2 font-medium text-brand-700 underline">
                  See all {stillLate.length} late records
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const SHORT = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

function Items({ list, today, showDate = false }: { list: DueItem[]; today: string; showDate?: boolean }) {
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {list.map((it) => {
        const t = toneOf(it.due_date, today);
        return (
          <li key={it.id}>
            <Link href={`/records/${it.id}`} className="flex min-h-12 items-start gap-2 py-2 hover:bg-brand-50">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${TONE[t].dot}`} aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{it.subject}</span>
                <span className="block text-sm text-slate-600">
                  <span className="font-mono">{it.tracking_no}</span>
                  {it.office ? ` · now with ${it.office}` : ""} ·{" "}
                  <span className={`font-semibold ${TONE[t].text}`}>{showDate ? `was due ${SHORT.format(utc(it.due_date))}` : TONE[t].label}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
