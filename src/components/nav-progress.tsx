"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formTarget, isNavigationClick } from "@/lib/nav-progress";

/**
 * Thin bar at the top of the window while the next page loads (GitHub / YouTube pattern).
 * The current page stays on screen until the new one is ready, so nothing blanks or jumps;
 * the bar only says "your click was received". It appears after a short delay so quick
 * page changes show nothing, and it is a plain static bar when the person prefers less motion.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const safety = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    function start() {
      if (pending.current) return;
      pending.current = true;
      window.clearTimeout(hideTimer.current);
      document.documentElement.dataset.navigating = "1";
      showTimer.current = window.setTimeout(() => setState("loading"), 150);
      // Never leave the bar up if a page change is cancelled or fails.
      safety.current = window.setTimeout(stop, 12000);
    }
    // Capture phase: next/link and next/form cancel the browser's own navigation in their handlers.
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a && isNavigationClick(a, e, window.location.href)) start();
    }
    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      // Search and filter forms (next/form, with an action) change the page; forms that save something,
      // and chat-style forms with no action, show their own state.
      if ((form.method || "get").toLowerCase() !== "get" || !form.hasAttribute("action") || form.target) return;
      const fields = new FormData(form, (e.submitter as HTMLElement | null) ?? undefined);
      if (formTarget(form.getAttribute("action") ?? "", fields, window.location.href)) start();
    }
    function stop() {
      if (!pending.current) return;
      pending.current = false;
      window.clearTimeout(showTimer.current);
      window.clearTimeout(safety.current);
      delete document.documentElement.dataset.navigating;
      setState((s) => (s === "loading" ? "done" : "idle"));
      hideTimer.current = window.setTimeout(() => setState("idle"), 250);
    }
    stopRef.current = stop;
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", stop);
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(safety.current);
    };
  }, []);

  // The new page has arrived.
  useEffect(() => {
    stopRef.current();
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div aria-hidden="true" className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div className={`nav-progress h-full bg-gold-500 ${state === "done" ? "nav-progress-done" : ""}`} />
    </div>
  );
}
