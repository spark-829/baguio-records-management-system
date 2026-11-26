"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Checks the authenticator code on the server. The sign-in cookie is HttpOnly (QA-089), so the browser
 * cannot run this itself; the upgraded session is written back as a cookie here.
 */
export async function verifyMfa(code: string, next?: string): Promise<{ error: string } | undefined> {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return { error: "That code did not work. Check the time on your phone and try again." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { error: "No authenticator is set up for this account." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
  if (error) return { error: "That code did not work. Check the time on your phone and try again." };
  await supabase.rpc("rms_log_access", { p_event: "mfa_verified" });
  redirect(safeNextPath(next) ?? "/");
}
