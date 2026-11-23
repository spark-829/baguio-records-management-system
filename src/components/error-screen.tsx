"use client";

import { useEffect, useState } from "react";
import { isReloadableError, RELOAD_KEY, shouldAutoReload } from "@/lib/reload-error";

/**
 * Friendly stand-in for Next.js's bare "Application error" screen. When the error is the kind a
 * reload fixes (site updated while the tab was open, dropped connection), it reloads once by itself.
 */
export function ErrorScreen({ error, reset, t }: { error: Error & { digest?: string }; reset: () => void; t: (s: string) => string }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    console.error(error);
    if (!isReloadableError(error)) return;
    let last: string | null = null;
    try { last = sessionStorage.getItem(RELOAD_KEY); } catch { /* storage blocked */ }
    if (!shouldAutoReload(last)) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
    setReloading(true);
    window.location.reload();
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center" role="alert">
      <h1 className="text-2xl font-bold">{t(reloading ? "Loading the newest version…" : "Something went wrong")}</h1>
      <p className="mt-2 text-slate-700">{t("The page did not load properly. This can happen right after the system is updated or when the internet connection drops. Nothing you saved was lost.")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>{t("Reload the page")}</button>
        <button type="button" className="btn-secondary" onClick={() => reset()}>{t("Try again")}</button>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-slate-500">{t("Error code")}: {error.digest}</p>}
    </div>
  );
}
