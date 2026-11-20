"use client";

import { useState } from "react";

export function SummaryBox({ recordId, initial, aiBlocked = false }: { recordId: string; initial: string | null; aiBlocked?: boolean }) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not summarize");
      setSummary(json.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not summarize");
    } finally {
      setBusy(false);
    }
  }

  if (aiBlocked)
    return (
      <section className="card p-4 text-sm text-slate-600">
        <span className="badge bg-slate-100 text-slate-700">AI off</span> Confidential record: kept out of AI features by office policy.
      </section>
    );

  return (
    <section className="card border-brand-100 bg-brand-50/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="badge bg-brand-100 text-brand-900">AI</span> Summary
        </h2>
        <button onClick={generate} disabled={busy} className="text-sm text-brand-700 hover:underline disabled:opacity-50">
          {busy ? "Summarizing…" : summary ? "Refresh" : "Summarize"}
        </button>
      </div>
      {summary?.startsWith("Demo summary: ") ? (
        <p className="mt-2 text-sm text-slate-700">
          <span className="badge mr-1 bg-amber-100 text-amber-900">Demo mode: sample AI output</span>
          {summary.slice("Demo summary: ".length)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{summary ?? "No summary yet."}</p>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </section>
  );
}
