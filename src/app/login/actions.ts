"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-next";

type LoginState = { error?: string; email?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { t } = await getT();
  if (!email || !password) return { email, error: "Enter your email and password." };
  if (formData.get("privacy") !== "on") return { email, error: "Please confirm you have read the privacy notice." };
  const supabase = await createClient();

  // Locked accounts are refused before the password is even checked.
  const { data: guard } = await supabase.rpc("rms_login_check", { p_email: email });
  if (guard?.locked) return { email, error: t("This account is locked after too many failed sign-ins. Try again in {n} minute(s) or ask an administrator to unlock it.", { n: guard.minutes }) };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const { data: fail } = await supabase.rpc("rms_login_failed", { p_email: email });
    if (fail?.locked) return { email, error: t("Too many failed sign-ins. This account is locked for {n} minutes.", { n: fail.minutes }) };
    if (typeof fail?.remaining === "number" && fail.remaining <= 2)
      return { email, error: t("Wrong email or password. {n} attempt(s) left before the account locks.", { n: fail.remaining }) };
    return { email, error: "Wrong email or password." };
  }

  const { data: ok } = await supabase.rpc("rms_login_succeeded");
  if (!ok) {
    await supabase.auth.signOut();
    return { email, error: "This account is locked or has no active RMS access. Ask an administrator." };
  }

  // Admins who turned on two-step sign-in must enter their authenticator code next.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const next = safeNextPath(formData.get("next"));
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect(next ? `/mfa?next=${encodeURIComponent(next)}` : "/mfa");
  redirect(next ?? "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: "logout" });
  await supabase.auth.signOut();
  redirect("/login?error=signed-out");
}
