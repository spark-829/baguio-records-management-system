import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** The signed-in user's RMS profile. Sends locked, inactive or not-yet-verified users elsewhere. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/mfa");
  const { data } = await supabase
    .from("rms_profiles")
    .select("id, full_name, role, office_id, is_active, locked_until, office:rms_offices(code, name)")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data || !data.is_active) redirect("/api/auth/signout?reason=no-access");
  if (data.locked_until && new Date(data.locked_until) > new Date()) redirect("/api/auth/signout?reason=locked");
  return data as unknown as Profile;
});

export function isCentral(p: Profile) {
  return p.role === "admin" || p.role === "records_officer";
}

/** Read one admin setting (e.g. idle_timeout_minutes). */
export const getSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("rms_settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  return {
    lockoutThreshold: Number(map.lockout_threshold ?? 5),
    lockoutMinutes: Number(map.lockout_minutes ?? 15),
    idleTimeoutMinutes: Number(map.idle_timeout_minutes ?? 15),
    watermarkDownloads: map.watermark_downloads !== false,
    aiExcludeConfidential: map.ai_exclude_confidential !== false,
  };
});
