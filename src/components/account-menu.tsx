"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useExclusivePanel } from "@/components/use-exclusive-panel";
import { useT } from "@/lib/i18n/client";
import { LangToggle } from "@/components/lang-toggle";
import { UserIcon } from "@/components/icons";

/** My account icon in the header. Opens a small card with the link to /security and the language switch. */
export function AccountMenu() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useExclusivePanel("account", open, close);

  useEffect(() => setOpen(false), [pathname]);

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

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="account-panel"
        title={t("My account")}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/60 hover:bg-white/10"
      >
        <UserIcon />
        <span className="sr-only">{t("My account")}</span>
      </button>
      {open && (
        <div id="account-panel" className="card absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain text-left text-slate-900">
          <Link prefetch={false} href="/security" className="block min-h-12 border-b border-slate-200 px-4 py-3 no-underline hover:bg-brand-50">
            <span className="block text-base font-bold text-brand-800">{t("My account")}</span>
            <span className="block text-sm text-slate-700">{t("Two-step sign-in")}</span>
          </Link>
          <div className="px-4 py-3">
            <div className="mb-2 text-sm font-semibold text-slate-800">{t("Language")}</div>
            <LangToggle />
          </div>
        </div>
      )}
    </div>
  );
}
