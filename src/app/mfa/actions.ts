"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next";

export async function mfaVerified(next?: string) {
  const supabase = await createClient();
  await supabase.rpc("rms_log_access", { p_event: "mfa_verified" });
  redirect(safeNextPath(next) ?? "/");
}
