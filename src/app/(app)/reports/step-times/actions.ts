"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CHARTER_MINUTES, STEP_KEYS, validateStepForm } from "@/lib/step-times";

export async function saveStepTimes(form: FormData) {
  const me = await getProfile();
  if (me.role !== "records_officer") redirect("/reports");
  const preset = form.get("preset") === "charter";
  let minutes: Record<string, number> = { ...CHARTER_MINUTES };
  if (!preset) {
    const entries: Record<string, string> = {};
    for (const k of STEP_KEYS) entries[k] = String(form.get(k) ?? "");
    const v = validateStepForm(entries);
    if ("error" in v) redirect("/reports/step-times?error=1");
    minutes = v.minutes;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_set_step_minutes", { p_minutes: minutes });
  if (error) redirect("/reports/step-times?error=1");
  revalidatePath("/", "layout");
  redirect("/reports/step-times?saved=1");
}
