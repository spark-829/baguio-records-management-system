"use client";

import { useT } from "@/lib/i18n/client";

/*
 * Original mark for the demo: a filed document with a gold dog-ear fold and a
 * Benguet pine cut out of the page (three tiers that also read as register
 * lines). currentColor + gold accent. Not the City seal or any official emblem.
 */
export function PineMark({ className = "h-10 w-10 text-gold-100" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd"
        d="M10.5 3H22.5V9.5A3.5 3.5 0 0 0 26 13H33V33.5A3.5 3.5 0 0 1 29.5 37H10.5A3.5 3.5 0 0 1 7 33.5V6.5A3.5 3.5 0 0 1 10.5 3ZM20 10 24 15H16ZM17 17H23L26.5 22H13.5ZM15.5 24H24.5L29 29.5H21.5V33H18.5V29.5H11Z" />
      <path className="fill-gold-500" d="M24 3 33 12H27A3 3 0 0 1 24 9Z" />
    </svg>
  );
}

export function BrandLockup({ sub = true }: { sub?: boolean }) {
  const t = useT();
  return (
    <span className="flex items-center gap-3">
      <PineMark className="h-11 w-11 shrink-0 text-gold-100" />
      <span className="leading-tight">
        <span className="block text-xl font-bold tracking-tight text-white">{t("Baguio RMS")}</span>
        {sub && <span className="hidden text-xs text-brand-100 sm:block">{t("Records Management System")}</span>}
      </span>
    </span>
  );
}

export function SiteFooter({ className = "mt-10" }: { className?: string }) {
  const t = useT();
  return (
    <footer className={`no-print ${className} border-t-4 border-gold-500 bg-brand-900 text-brand-100`}>
      <div className="on-dark mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <PineMark className="h-9 w-9 shrink-0 text-gold-100" />
          <div className="leading-snug">
            <div className="font-semibold text-white">Baguio RMS</div>
            <div>{t("Records Management System")}</div>
          </div>
        </div>
        <p className="max-w-xl leading-relaxed sm:text-right">
          <strong className="font-semibold text-white">{t("Demo system — not an official City Government of Baguio service.")}</strong>{" "}
          {t("All names and records shown are fictional.")}{" "}
          <a href="/developer" className="inline-flex min-h-11 items-center font-semibold text-white underline">{t("About the developer")}</a>
        </p>
      </div>
    </footer>
  );
}
