"use client";

import { useT } from "@/lib/i18n/client";

import { useState } from "react";
import { verifyMfa } from "./actions";

export function MfaChallenge({ next }: { next?: string }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await verifyMfa(code.trim(), next);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <>
    <form onSubmit={verify} className="mt-4 space-y-3">
      <input
        className="input text-center font-mono text-lg tracking-[0.4em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        autoFocus
        required
      />
      {error && <p className="text-sm text-red-700">{t(error)}</p>}
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{t(busy ? "Checking…" : "Verify")}</button>
    </form>
    <form method="post" action="/api/auth/signout" className="mt-3 text-center">
      <button type="submit" className="text-xs text-slate-500 hover:underline">{t("Cancel and sign out")}</button>
    </form>
    </>
  );
}
