"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { statusFromHealth, type SystemStatus } from "@/lib/signin-extras";

/**
 * Small system status line (like the status notes on GOV.UK and Slack sign-in pages). It asks the real
 * /api/health check once, after the page has loaded, so the sign-in page itself stays light.
 */
export function StatusLine() {
  const t = useT();
  const [status, setStatus] = useState<SystemStatus>("checking");
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch("/api/health", { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => statusFromHealth(r.ok, await r.json().catch(() => null)))
      .catch(() => "down" as const)
      .then((s) => live && setStatus(s))
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      ctrl.abort();
    };
  }, []);
  const look = {
    checking: { dot: "bg-slate-400", text: "Checking the system…" },
    up: { dot: "bg-emerald-600", text: "System status: working normally." },
    down: { dot: "bg-red-600", text: "System status: the records database is not answering. Signing in may fail; try again in a few minutes." },
  }[status];
  return (
    <p role="status" className="mt-3 flex items-start gap-2 text-sm text-slate-700">
      <span aria-hidden="true" className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} />
      <span>{t(look.text)}</span>
    </p>
  );
}
