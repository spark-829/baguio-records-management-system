"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "rms-last-activity";
const EVENTS = ["mousedown", "keydown", "touchstart"] as const;
const WARN_MS = 60_000;

/**
 * Signs the user out after a period without activity (shared across tabs).
 * A minute before, a large message with a countdown asks "Are you still there?" with one clear button.
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const lastRef = useRef(0);

  const stay = () => {
    lastRef.current = Date.now();
    try {
      localStorage.setItem(KEY, String(lastRef.current));
    } catch {}
    setLeft(null);
  };

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const limit = minutes * 60_000;
    lastRef.current = Date.now();
    const write = () => {
      lastRef.current = Date.now();
      try {
        localStorage.setItem(KEY, String(lastRef.current));
      } catch {}
    };
    // Clicks and key presses always count. Mouse movement alone does not dismiss the warning, so it can be read.
    const onActivity = () => write();
    let throttle = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - throttle < 5000) return;
      throttle = now;
      let shared = lastRef.current;
      try {
        shared = Math.max(shared, Number(localStorage.getItem(KEY)) || 0);
      } catch {}
      if (Date.now() - shared < limit - WARN_MS) write();
    };
    write();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onMove, { passive: true });
    const tick = () => {
      let shared = lastRef.current;
      try {
        shared = Math.max(shared, Number(localStorage.getItem(KEY)) || 0);
      } catch {}
      const idle = Date.now() - shared;
      if (idle >= limit) window.location.href = "/api/auth/signout?reason=idle";
      else if (idle >= limit - WARN_MS) setLeft(Math.ceil((limit - idle) / 1000));
      else setLeft(null);
    };
    const timer = window.setInterval(tick, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onMove);
      window.clearInterval(timer);
    };
  }, [minutes]);

  const showing = left !== null;
  useEffect(() => {
    if (showing) button.current?.focus();
  }, [showing]);

  if (left === null) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text" className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
        <h2 id="idle-title" className="text-2xl font-bold">Are you still there?</h2>
        <p id="idle-text" className="mt-3 text-lg text-slate-800">
          To keep records safe, you will be signed out in <strong className="tabular-nums">{left}</strong> second{left === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-slate-700">Anything you were typing and have not saved will be lost.</p>
        <button ref={button} type="button" onClick={stay} className="btn-primary mt-5 w-full py-3 text-lg">
          Yes, keep me signed in
        </button>
      </div>
    </div>
  );
}
