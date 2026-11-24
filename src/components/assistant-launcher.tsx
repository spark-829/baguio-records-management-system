"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Chat } from "@/app/(app)/assistant/chat";
import { useT } from "@/lib/i18n/client";

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Assistant button at the right end of the nav bar (icon only below lg) with a chat panel: bottom-right on wider screens, full screen on phones. Hidden on the full assistant page and the register form. */
export function AssistantLauncher() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  // The full assistant page has its own chat; the register form keeps the screen for its phone action bar.
  const hideHere = pathname === "/assistant" || pathname.startsWith("/assistant/") || pathname === "/records/new" || pathname.startsWith("/records/new/");
  const shown = open && !hideHere;

  function toggle() {
    setEverOpened(true);
    setOpen((o) => !o);
  }

  function closeAndReturnFocus() {
    returnFocus.current = true;
    setOpen(false);
  }

  function closeOnPhone() {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }

  useEffect(() => {
    if (hideHere) setOpen(false);
  }, [hideHere]);

  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      const id = requestAnimationFrame(() => launcher.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!shown) return;
    const id = requestAnimationFrame(() => document.getElementById("ask-popup")?.focus());
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const active = document.activeElement;
      if (panel.current?.contains(active) || active === launcher.current) closeAndReturnFocus();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  return (
    <>
      {everOpened && (
        <div
          id="assistant-panel"
          ref={panel}
          role="dialog"
          aria-labelledby="assistant-panel-title"
          className={`no-print fixed inset-0 z-40 flex-col overflow-hidden bg-white sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(640px,calc(100vh-2rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl ${shown ? "flex" : "hidden"}`}
        >
          <div className="on-dark flex items-center gap-2 bg-brand-800 px-4 py-3 text-white">
            <div className="min-w-0 flex-1 leading-tight">
              <h2 id="assistant-panel-title" className="text-lg font-bold text-white">{t("Records assistant")}</h2>
              <p className="hidden text-sm text-brand-100 sm:block">{t("Searches only the records you may see")}</p>
            </div>
            <Link prefetch={false} href="/assistant" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg px-2 text-base font-semibold underline underline-offset-4 hover:bg-white/10">
              {t("Open full page")}
            </Link>
            <button type="button" onClick={closeAndReturnFocus} aria-label={t("Close assistant")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10">
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Chat compact inputId="ask-popup" onNavigate={closeOnPhone} />
          </div>
        </div>
      )}
      {!hideHere && (
        <button
          ref={launcher}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="assistant-panel"
          className={`no-print my-1 min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-brand-700 bg-white px-2.5 text-base font-semibold text-brand-800 hover:bg-brand-50 lg:px-3.5 ${open ? "hidden sm:inline-flex" : "inline-flex"}`}
        >
          {open ? <CloseIcon /> : <ChatIcon />}
          <span className="sr-only lg:not-sr-only">{open ? t("Close assistant") : t("Ask the assistant")}</span>
        </button>
      )}
    </>
  );
}
