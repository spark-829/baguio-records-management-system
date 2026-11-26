"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Sends a password help request to the administrator. Same answer whether or not the email has an account. */
export async function requestPasswordHelp(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (email) {
    const supabase = await createClient();
    await supabase.rpc("rms_request_password_help", { p_email: email });
  }
  redirect("/login/forgot?sent=1");
}
