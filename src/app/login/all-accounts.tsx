"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { DEMO_OFFICES, demoAccountCount, demoHref } from "@/lib/demo-accounts";

/**
 * "All N accounts, by office" on the sign-in page. The list is long, so it is drawn in the browser only when
 * someone opens it: the server no longer renders and sends it on every sign-in page load (QA-076, CPU limit).
 */
export function AllAccounts({ next }: { next: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDetailsElement>(null);
  // Opened before the page finished loading: the toggle event was missed, so read the state once.
  useEffect(() => {
    if (box.current?.open) setOpen(true);
  }, []);
  return (
    <details ref={box} className="mt-4" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer py-1 font-semibold text-brand-800">{t("All {n} accounts, by office", { n: demoAccountCount() })}</summary>
      {open && (
        <div className="mt-3 space-y-4">
          {DEMO_OFFICES.map((o) => (
            <div key={o.office}>
              <h3 className="text-sm font-semibold text-ink">{t(o.office)}</h3>
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
        </div>
      )}
    </details>
  );
}
