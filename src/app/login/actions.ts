"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type LoginState = { error?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  if (formData.get("privacy") !== "on") return { error: "Please confirm you have read the privacy notice." };
  const supabase = await createClient();

  // Locked accounts are refused before the password is even checked.
  const { data: guard } = await supabase.rpc("rms_login_check", { p_email: email });
  if (guard?.locked) return { error: `This account is locked after too many failed sign-ins. Try again in ${guard.minutes} minute(s) or ask an administrator to unlock it.` };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const { data: fail } = await supabase.rpc("rms_login_failed", { p_email: email });
    if (fail?.locked) return { error: `Too many failed sign-ins. This account is locked for ${fail.minutes} minutes.` };
    if (typeof fail?.remaining === "number" && fail.remaining <= 2)
      return { error: `Wrong email or password. ${fail.remaining} attempt(s) left before the account locks.` };
    return { error: "Wrong email or password." };
  }

  const { data: ok } = await supabase.rpc("rms_login_succeeded");
  if (!ok) {
    await supabase.auth.signOut();
    return { error: "This account is locked or has no active RMS access. Ask an administrator." };
  }

  // Admins who turned on two-step sign-in must enter their authenticator code next.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/mfa");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: "logout" });
  await supabase.auth.signOut();
  redirect("/login");
}
