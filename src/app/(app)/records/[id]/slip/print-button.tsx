"use client";

import { useT } from "@/lib/i18n/client";

export function PrintButton({ label = "Print slip" }: { label?: string }) {
  const t = useT();
  return <button onClick={() => window.print()} className="btn-primary">{t(label)}</button>;
}
