"use server";

import { createClient } from "@/lib/supabase/server";

/** Authenticator setup runs on the server because the sign-in cookie is HttpOnly (QA-089). */
export type MfaFactor = { id: string; status: string; friendly_name?: string; created_at: string };

export async function listMfa(): Promise<MfaFactor[]> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.all ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name, created_at: f.created_at }));
}

export async function startMfa(): Promise<{ id: string; qr: string; secret: string } | { error: string }> {
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  // Clear any half-finished setup first.
  for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `RMS ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "Could not start setup" };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmMfa(factorId: string, code: string): Promise<{ error?: string }> {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return { error: "That code did not work. Try the newest code." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: String(factorId), code: clean });
  if (error) return { error: "That code did not work. Try the newest code." };
  return {};
}

export async function removeMfa(factorId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: String(factorId) });
  if (error) return { error: "Could not turn off two-step sign-in. Sign in again and try once more." };
  return {};
}
