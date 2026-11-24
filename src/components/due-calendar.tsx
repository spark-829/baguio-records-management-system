"use client";

import { useLang, useT } from "@/lib/i18n/client";
import { dateLocale } from "@/lib/i18n/core";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type Tone, toneOf, utc } from "@/lib/due";

export type DueItem = { id: string; tracking_no: string; subject: string; due_date: string; office: string | null };


const TONE: Record<Tone, { dot: string; text: string; label: string }> = {
  late: { dot: "bg-red-600", text: "text-red-800", label: "Late (overdue)" },
  soon: { dot: "bg-amber-500", text: "text-amber-900", label: "Due within 7 days" },
  ok: { dot: "bg-emerald-600", text: "text-emerald-800", label: "On track" },
};

const ORDER: Record<Tone, number> = { late: 0, soon: 1, ok: 2 };
// 3 dots fit a 44px phone cell (4 + "+" overflowed into the next day)
const MAX_DOTS = 3;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formats = (locale: string) => ({
  month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }),
  longDay: new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);


/**
 * Month calendar of due dates (open records only), in the style of a family calendar app:
 * colored dots under each date, tap a date to see what is due that day.
 * Large cells and words beside every color, for older staff and color-blind users.
 */
export function DueCalendar({ items, today, lateTotal }: { items: DueItem[]; today: string; lateTotal?: number }) {
  const t = useT();
  const lang = useLang();
  const fmt = useMemo(() => formats(dateLocale(lang)), [lang]);
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
  // Heading and link use the server total; the list itself comes from the dashboard's 500-row sample
  const lateN = Math.max(lateTotal ?? 0, stillLate.length);
  const lateListed = Math.min(stillLate.length, 5);

  return (
    <section className="card p-4" aria-labelledby="cal-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cal-title" className="text-lg font-bold">{t("Due dates calendar")}</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-secondary min-h-11 min-w-11 px-3" onClick={() => shift(-1)} aria-label={t("Previous month")}>‹</button>
          <span className="min-w-40 text-center text-lg font-semibold" aria-live="polite">{fmt.month.format(first)}</span>
          <button type="button" className="btn-secondary min-h-11 min-w-11 px-3" onClick={() => shift(1)} aria-label={t("Next month")}>›</button>
          {month !== today.slice(0, 7) && (
            <button type="button" className="btn-secondary min-h-11 px-3" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today); }}>
              {t("Today")}
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("What the colors mean")}>
        {(Object.keys(TONE) as Tone[]).map((tone) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-full ${TONE[tone].dot}`} aria-hidden />
            {t(TONE[tone].label)}
          </li>
        ))}
        {lateCount > 0 && <li className="text-slate-600">{t("Tap today's date to also see everything that is late.")}</li>}
      </ul>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div role="group" aria-label={`${t("Due dates")}, ${fmt.month.format(first)}`}>
          <div className="grid grid-cols-7 border-b-2 border-brand-100 pb-1" aria-hidden>
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-sm font-semibold text-slate-600">{t(w)}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7" data-dense-grid>
            {days.slice(0, weeks * 7).map((d) => {
                  const due = byDay.get(d) ?? [];
                  const inMonth = d.startsWith(month);
                  const tones = due.map((it) => toneOf(it.due_date, today));
                  const counts = (["late", "soon", "ok"] as Tone[]).map((tone) => [tone, tones.filter((x) => x === tone).length] as const).filter(([, n]) => n);
                  const label = `${fmt.longDay.format(utc(d))}${d === today ? `, ${t("today")}` : ""}: ${due.length ? t("{n} due", { n: due.length }) + (counts.length ? ` (${counts.map(([tone, n]) => `${n} ${t(TONE[tone].label).toLowerCase()}`).join(", ")})` : "") : t("nothing due")}`;
                  return (
                    <div key={d} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => { setPicked(d); if (!inMonth) setMonth(d.slice(0, 7)); }}
                        aria-label={label}
                        aria-pressed={picked === d}
                        className={`flex h-14 w-full flex-col items-center justify-center rounded-lg text-base sm:h-16 ${
                          picked === d ? "bg-brand-700 text-white" : d === today ? "bg-gold-100 ring-2 ring-gold-500" : "hover:bg-brand-50"
                        } ${inMonth ? "" : "opacity-40"}`}
                      >
                        {/* One dot per record, above the date, most urgent first; a busy day shows 3 and a "+" */}
                        <span className="flex h-3 items-center gap-0.5" aria-hidden>
                          {[...tones].sort((x, y) => ORDER[x] - ORDER[y]).slice(0, MAX_DOTS).map((tone, i) => (
                            <span key={i} className={`h-2 w-2 rounded-full ring-1 ring-white sm:h-2.5 sm:w-2.5 ${TONE[tone].dot}`} />
                          ))}
                          {tones.length > MAX_DOTS && <span className={`text-xs leading-none font-bold ${picked === d ? "text-white" : "text-slate-700"}`}>+</span>}
                        </span>
                        <span className={`mt-0.5 tabular-nums ${d === today ? "font-bold" : ""}`}>{Number(d.slice(8))}</span>
                      </button>
                    </div>
                  );
                })}
          </div>
        </div>

        <div aria-live="polite">
          <h3 className="text-base font-bold">
            {fmt.longDay.format(utc(picked))}
            {picked === today && ` (${t("today")})`}
          </h3>
          {pickedItems.length === 0 ? (
            <p className="mt-2 text-slate-700">{t("Nothing is due on this day. Tap a date with a dot to see what is due.")}</p>
          ) : (
            <Items list={pickedItems} today={today} />
          )}
          {stillLate.length > 0 && (
            <>
              <h3 className="mt-4 text-base font-bold text-red-800">{t("Still late from earlier days ({n})", { n: lateN })}</h3>
              <Items list={stillLate.slice(0, 5)} today={today} showDate />
              {lateN > lateListed && (
                <Link prefetch={false} href="/records?overdue=1" className="mt-1 inline-block py-2 font-medium text-brand-700 underline">
                  {t("See all {n} late records", { n: lateN })}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}


function Items({ list, today, showDate = false }: { list: DueItem[]; today: string; showDate?: boolean }) {
  const t = useT();
  const short = new Intl.DateTimeFormat(dateLocale(useLang()), { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {list.map((it) => {
        const tone = toneOf(it.due_date, today);
        return (
          <li key={it.id}>
            <Link prefetch={false} href={`/records/${it.id}`} className="flex min-h-12 items-start gap-2 py-2 hover:bg-brand-50">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${TONE[tone].dot}`} aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{it.subject}</span>
                <span className="block text-sm text-slate-600">
                  <span className="font-mono">{it.tracking_no}</span>
                  {it.office ? ` · ${t("now with {office}", { office: it.office })}` : ""} ·{" "}
                  <span className={`font-semibold ${TONE[tone].text}`}>{showDate ? t("was due {date}", { date: short.format(utc(it.due_date)) }) : t(TONE[tone].label)}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
