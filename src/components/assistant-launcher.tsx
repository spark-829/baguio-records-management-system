"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Chat } from "@/app/(app)/assistant/chat";
import { readChat } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";

// Below 1280px the panel is a modal; from 1280px it docks beside the page.
const MODAL_QUERY = "(max-width: 79.99rem)";

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

type LauncherProps = { userId: string; greeting: string; scope: string; office: string; prompts: string[]; demo: boolean };

/** One labelled "Ask the assistant" button, fixed bottom-right, with a full-height panel on the right: docked and pushing the page from 1280px, a modal sheet below that, full screen on phones. Hidden on the full assistant page; hidden below sm on the register form. */
export function AssistantLauncher({ userId, greeting, scope, office, prompts, demo }: LauncherProps) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  // The full assistant page has its own chat; the register form keeps the phone screen for its action bar.
  const hideHere = pathname === "/assistant" || pathname.startsWith("/assistant/");
  const onRegister = pathname === "/records/new" || pathname.startsWith("/records/new/");
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
    if (window.matchMedia(MODAL_QUERY).matches) setOpen(false);
  }

  useEffect(() => {
    if (hideHere) setOpen(false);
  }, [hideHere]);

  // Purge any other user's stored chat as soon as the signed-in shell loads, not only when the chat opens.
  useEffect(() => {
    readChat(userId);
  }, [userId]);

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
    // Below 1280px = modal (focus stays inside, APG dialog pattern);
    // from 1280px it is a side panel the page stays usable beside.
    const mq = window.matchMedia(MODAL_QUERY);
    document.documentElement.dataset.assistant = "open";
    function sync() {
      if (mq.matches) panel.current?.setAttribute("aria-modal", "true");
      else panel.current?.removeAttribute("aria-modal");
    }
    sync();
    mq.addEventListener("change", sync);
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        // Phone: modal, so Esc always closes. Wider: only when focus is in the panel, on its button, or nowhere.
        const a = document.activeElement;
        if (mq.matches || !a || a === document.body || panel.current?.contains(a) || a === launcher.current) closeAndReturnFocus();
        return;
      }
      if (e.key !== "Tab" || !mq.matches || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      delete document.documentElement.dataset.assistant;
      mq.removeEventListener("change", sync);
    };
  }, [shown]);

  return (
    <>
      {everOpened && (
        <>
          {shown && <div aria-hidden="true" onClick={closeAndReturnFocus} className="no-print fixed inset-0 z-30 bg-slate-900/40 max-sm:hidden xl:hidden" />}
          <div
            id="assistant-panel"
            ref={panel}
            role="dialog"
            aria-labelledby="assistant-panel-title"
            className={`no-print fixed top-0 right-0 bottom-0 z-40 h-dvh w-full flex-col overflow-hidden border-l border-slate-300 bg-white shadow-xl sm:w-[26rem] ${shown ? "flex" : "hidden"}`}
          >
            <div className="on-dark flex items-center gap-2 bg-brand-700 px-4 py-2 text-white">
              <h2 id="assistant-panel-title" className="min-w-0 flex-1 text-lg font-bold text-white">{t("Records assistant")}</h2>
              <button type="button" onClick={closeAndReturnFocus} aria-label={t("Close assistant")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10">
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Chat userId={userId} compact fullPageLink inputId="ask-popup" onNavigate={closeOnPhone} greeting={greeting} scope={scope} office={office} prompts={prompts} demo={demo} />
            </div>
          </div>
        </>
      )}
      {!hideHere && !open && (
        <button
          ref={launcher}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="assistant-panel"
          aria-label={t("Ask the assistant")}
          className={`assistant-fab no-print fixed right-4 bottom-4 z-30 min-h-12 items-center gap-2 rounded-full bg-brand-700 px-5 text-base font-semibold text-white shadow-lg ring-2 ring-white hover:bg-brand-800 focus-visible:outline sm:right-6 sm:bottom-6 ${onRegister ? "hidden sm:inline-flex" : "inline-flex"}`}
        >
          <ChatIcon />
          <span className="fab-short sm:hidden" aria-hidden="true">{t("Ask")}</span>
          <span className="fab-long hidden sm:inline" aria-hidden="true">{t("Ask the assistant")}</span>
        </button>
      )}
    </>
  );
}
