import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** The signed-in user's RMS profile. Redirects to /login when there is no active profile. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data } = await supabase
    .from("rms_profiles")
    .select("id, full_name, role, office_id, is_active, office:rms_offices(code, name)")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data || !data.is_active) redirect("/login?error=no-access");
  return data as unknown as Profile;
});

export function isCentral(p: Profile) {
  return p.role === "admin" || p.role === "records_officer";
}
