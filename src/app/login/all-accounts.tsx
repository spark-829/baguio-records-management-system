"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { DEMO_OFFICES, demoAccountCount, demoHref } from "@/lib/demo-accounts";

/**
 * Every demo account, by office, in a box that scrolls (no open/close step). The list is long, so it is drawn
 * in the browser after the page loads; the server does not render it on every sign-in page load (QA-076,
 * CPU limit). The box keeps its height while it fills, so nothing on the page jumps.
 */
export function AllAccounts({ next }: { next: string }) {
  const t = useT();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const n = demoAccountCount();
  return (
    <div className="mt-5">
      <h3 id="all-accounts-h" className="font-semibold text-ink">{t("All {n} accounts, by office", { n })}</h3>
      <p className="text-sm text-slate-600">{t("Scroll down inside the list to see all {n} accounts.", { n })}</p>
      <div
        role="region"
        aria-labelledby="all-accounts-h"
        tabIndex={0}
        className="scroll-fade mt-2 h-80 overflow-y-auto overscroll-contain rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {ready ? (
          <div className="space-y-4 pb-2">
            {DEMO_OFFICES.map((o) => (
              <div key={o.office}>
                <h4 className="text-sm font-semibold text-ink">{t(o.office)}</h4>
                <ul className="mt-1 space-y-1">
                  {o.accounts.map((a) => (
                    <li key={a.email} className="flex flex-wrap items-baseline gap-x-2">
                      <a href={demoHref(a.email, next)} className="font-mono text-sm break-all text-brand-700 underline underline-offset-2">{a.email}</a>
                      <span className="text-sm text-slate-600">{t(a.role)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="border-t border-slate-200 pt-2 text-sm text-slate-600">{t("End of the list.")}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t("Loading accounts…")}</p>
        )}
      </div>
    </div>
  );
}
