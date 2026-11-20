"use client";

import { useEffect, useState } from "react";

const KEY = "rms-last-activity";
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/** Signs the user out after a period without activity (shared across tabs), with a one-minute warning. */
export function IdleLogout({ minutes }: { minutes: number }) {
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    const write = () => {
      last = Date.now();
      try {
        localStorage.setItem(KEY, String(last));
      } catch {}
    };
    let throttle = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - throttle < 5000) return;
      throttle = now;
      write();
      setWarn(false);
    };
    write();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = window.setInterval(() => {
      let shared = last;
      try {
        shared = Math.max(last, Number(localStorage.getItem(KEY)) || 0);
      } catch {}
      const idle = Date.now() - shared;
      if (idle >= limit) window.location.href = "/api/auth/signout?reason=idle";
      else setWarn(idle >= limit - 60_000);
    }, 10_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [minutes]);

  if (!warn) return null;
  return (
    <div role="alert" className="no-print fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg">
      You will be signed out in about a minute because of inactivity. Move the mouse or press a key to stay signed in.
    </div>
  );
}
