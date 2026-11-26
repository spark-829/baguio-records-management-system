"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n/client";
import { badgeText, parseAlerts, type Alerts } from "@/lib/alerts";
import { fmtDate } from "@/lib/labels";
import { BellIcon } from "@/components/icons";
import { useExclusivePanel } from "@/components/use-exclusive-panel";

export function AlertBell({ officeCode }: { officeCode: string | null }) {
  const t = useT();
  const lang = useLang();
  const pathname = usePathname();
  const [data, setData] = useState<Alerts | null>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useExclusivePanel("alerts", open, close);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store", headers: { "x-rms-background": "1" } });
      if (!res.ok) return;
      setData(parseAlerts(await res.json()));
    } catch {
      // A signed-out redirect returns HTML, and the network can drop; keep the last count.
    }
  }, []);

  useEffect(() => {
    setOpen(false);
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 120_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const count = data?.count ?? 0;
  const badge = badgeText(count);
  const base = officeCode ? `/records?office=${encodeURIComponent(officeCode)}&here=1` : null;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="alert-panel"
        title={t("Alerts")}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/60 hover:bg-white/10"
      >
        <BellIcon />
        {/* Icon-only: the name comes from this text, which includes the count */}
        <span className="sr-only">{t("Alerts: {n} need your attention", { n: count })}</span>
        {badge && (
          <span aria-hidden="true" className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold leading-6 text-white">{badge}</span>
        )}
      </button>
      {open && (
        <div id="alert-panel" className="card absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain text-left text-slate-900">
          <h2 className="border-b border-slate-200 px-4 py-3 text-base font-bold">{t("Needs your office's attention")}</h2>
          {!data ? (
            <p className="px-4 py-3 text-sm text-slate-700" role="status">{t("Loading…")}</p>
          ) : data.rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-700">{t("Nothing new. You are all caught up.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link prefetch={false} href={`/records/${r.id}`} className="block min-h-12 px-4 py-2 no-underline hover:bg-brand-50">
                    <span className="block font-mono text-xs text-slate-600">{r.tracking_no}</span>
                    <span className="block truncate text-sm font-medium">{r.subject}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.to_receive && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{t("Sent to your office. Not yet received.")}</span>}
                      {r.late && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">{t("Late since {date}", { date: fmtDate(r.due_date, lang) })}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {base && (
            <div className="flex flex-wrap gap-x-4 border-t border-slate-200 px-4 text-sm">
              <Link prefetch={false} href={`${base}&open=1`} className="inline-flex min-h-11 items-center font-semibold">{t("See all in my office")}</Link>
              {data && data.late > 0 && (
                <Link prefetch={false} href={`${base}&overdue=1`} className="inline-flex min-h-11 items-center font-semibold">{t("See the late ones")}</Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
