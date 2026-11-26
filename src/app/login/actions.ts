"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SEEN_COOKIE, hardenCookie, signSeen } from "@/lib/session-cookie";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-next";

type LoginState = { error?: string; email?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { t } = await getT();
  if (!email || !password) return { email, error: "Enter your email and password." };
  if (formData.get("privacy") !== "on") return { email, error: "Please read and agree to the Terms of use and the Privacy notice before signing in." };
  const supabase = await createClient();

  // Locked accounts are refused before the password is even checked.
  const { data: guard } = await supabase.rpc("rms_login_check", { p_email: email });
  if (guard?.locked) return { email, error: t("This account is locked after too many failed sign-ins. Try again in {n} minute(s) or ask an administrator to unlock it.", { n: guard.minutes }) };

  const { data: signed, error } = await supabase.auth.signInWithPassword({ email, password });
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

  // Start the server-side idle clock (QA-089); the middleware renews it on each page the user opens.
  const key = process.env.RMS_SESSION_KEY || process.env.RMS_PROXY_KEY;
  const userId = signed.user?.id;
  if (key && userId) {
    const { data: idle } = await supabase.from("rms_settings").select("value").eq("key", "idle_timeout_minutes").maybeSingle();
    const minutes = Number(idle?.value ?? 15);
    const now = Date.now() / 1000;
    const value = await signSeen(key, userId, { start: now, seen: now, limit: Number.isFinite(minutes) && minutes > 0 ? minutes : 0 });
    (await cookies()).set(SEEN_COOKIE, value, hardenCookie({}, process.env.NODE_ENV === "production"));
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
