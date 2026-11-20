"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function mfaVerified() {
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: "mfa_verified" });
  redirect("/");
}
