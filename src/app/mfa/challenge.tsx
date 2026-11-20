"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mfaVerified } from "./actions";

export function MfaChallenge() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (!factor) {
      setError("No authenticator is set up for this account.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) {
      setError("That code did not work. Check the time on your phone and try again.");
      setBusy(false);
      return;
    }
    await mfaVerified();
  }

  return (
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
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
      <a href="/api/auth/signout" className="block text-center text-xs text-slate-500 hover:underline">Cancel and sign out</a>
    </form>
  );
}
