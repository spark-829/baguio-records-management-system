"use client";

import { useT } from "@/lib/i18n/client";

import { useCallback, useEffect, useState } from "react";
import { confirmMfa, listMfa, removeMfa, startMfa, type MfaFactor as Factor } from "./actions";

export function MfaSetup() {
  const t = useT();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFactors(await listMfa());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setMsg(null);
    const res = await startMfa();
    if ("error" in res) return setMsg(res.error);
    setEnroll(res);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    const { error } = await confirmMfa(enroll.id, code.trim());
    if (error) return setMsg(error);
    setEnroll(null);
    setCode("");
    setMsg("Two-step sign-in is on.");
    load();
  }

  async function remove(id: string) {
    const { error } = await removeMfa(id);
    if (error) return setMsg(error);
    setMsg("Two-step sign-in is off.");
    load();
  }

  const verified = (factors ?? []).filter((f) => f.status === "verified");
  if (factors === null) return <p className="mt-3 text-sm text-slate-500">{t("Loading…")}</p>;

  return (
    <div className="mt-3 space-y-3 text-sm">
      {verified.length > 0 ? (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-emerald-900">
          <span>{t("On since {date}", { date: new Date(verified[0].created_at).toLocaleDateString("en-PH") })}</span>
          <button className="text-red-700 hover:underline" onClick={() => remove(verified[0].id)}>{t("Turn off")}</button>
        </div>
      ) : enroll ? (
        <form onSubmit={confirm} className="space-y-3">
          <p>{t("1. Scan this with Google Authenticator, Microsoft Authenticator or a similar app.")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt={t("Authenticator QR code")} className="h-44 w-44 rounded border bg-white p-2" />
          <p className="text-xs text-slate-500">{t("Can't scan? Enter this key:")} <span className="font-mono">{enroll.secret}</span></p>
          <p>{t("2. Enter the 6-digit code it shows.")}</p>
          <div className="flex gap-2">
            <input className="input w-36 font-mono tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            <button className="btn-primary" disabled={code.length !== 6}>{t("Turn on")}</button>
          </div>
        </form>
      ) : (
        <button className="btn-secondary" onClick={start}>{t("Set up two-step sign-in")}</button>
      )}
      {msg && <p className="text-slate-700">{t(msg)}</p>}
    </div>
  );
}
