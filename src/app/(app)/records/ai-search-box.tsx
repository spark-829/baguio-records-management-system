"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AiSearchBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      router.push(`/records?${json.params}&ai=${encodeURIComponent(json.explanation)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <label htmlFor="ai-q" className="font-medium text-slate-800">Ask in your own words</label>
      <input
        id="ai-q"
        className="input flex-1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "urgent road requests from barangays last month"'
      />
      <button className="btn-primary" disabled={busy}>{busy ? "Looking…" : "Find"}</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
