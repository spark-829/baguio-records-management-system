import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";
import { parseStepMinutes } from "@/lib/step-times";

/** The signed-in user's RMS profile. Sends locked, inactive or not-yet-verified users elsewhere. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  // Speed: the profile is fetched at the same time as the sign-in is verified with Supabase Auth.
  // The query still runs under row-level security with the user's token, and we only use it
  // once getUser() confirms the same user id.
  const { data: local } = await supabase.auth.getSession();
  const guessId = local.session?.user.id;
  const profileQuery = async (id: string) => {
    const res = await supabase
      .from("rms_profiles")
      .select("id, full_name, role, office_id, is_active, locked_until, window_intake, office:rms_offices(code, name, features, ref_label)")
      .eq("id", id)
      .maybeSingle();
    if (!res.error) return res;
    // The app was deployed before the migrations: fall back to the old columns so nobody is signed out.
    return supabase
      .from("rms_profiles")
      .select("id, full_name, role, office_id, is_active, locked_until, office:rms_offices(code, name)")
      .eq("id", id)
      .maybeSingle();
  };
  const [{ data: auth }, early] = await Promise.all([supabase.auth.getUser(), guessId ? profileQuery(guessId) : Promise.resolve(null)]);
  if (!auth.user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/mfa");
  const { data } = early && guessId === auth.user.id ? early : await profileQuery(auth.user.id);
  if (!data || !data.is_active) redirect("/api/auth/signout?reason=no-access");
  if (data.locked_until && new Date(data.locked_until) > new Date()) redirect("/api/auth/signout?reason=locked");
  const profile = data as unknown as Profile;
  // Only Viewer accounts can be auditors (QA-097). Read separately so a database without the column still works.
  if (profile.role === "viewer") {
    const { data: aud } = await supabase.from("rms_profiles").select("is_auditor").eq("id", profile.id).maybeSingle();
    profile.is_auditor = (aud as { is_auditor?: boolean } | null)?.is_auditor === true;
  }
  return profile;
});

/** Administrators, and Viewer accounts flagged as auditors, may read the audit trail and access history (QA-097). */
export function canAudit(p: Profile) {
  return p.role === "admin" || (p.role === "viewer" && p.is_auditor === true);
}

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
    // Always on (QA-099): confidential records never go to the outside AI service, whatever the old setting says.
    aiExcludeConfidential: true,
    stepMinutes: parseStepMinutes(map.step_minutes),
  };
});
