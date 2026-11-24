"use client";

import { useT } from "@/lib/i18n/client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Sends the words typed in the records search box (input `inputId`) to the assistant, which turns them into list filters. */
export function AiSearchButton({ inputId }: { inputId: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const text = input?.value ?? "";
    if (!text.trim()) {
      input?.focus();
      return;
    }
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
    <>
      <button type="button" className="btn-secondary" onClick={run} disabled={busy}>
        {t(busy ? "Looking…" : "Ask the assistant to find it")}
      </button>
      {error && <p role="alert" className="basis-full text-sm text-red-700">{t(error)}</p>}
    </>
  );
}
