"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const NUMBERS: Record<string, [number, number]> = {
  lockout_threshold: [3, 10],
  lockout_minutes: [5, 1440],
  idle_timeout_minutes: [5, 240],
};
const FLAGS = ["watermark_downloads", "ai_exclude_confidential"];

export async function saveSettings(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") return;
  const supabase = await createClient();
  const now = new Date().toISOString();
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const n = Math.round(Number(form.get(key)));
    if (!Number.isFinite(n)) continue;
    await supabase.from("rms_settings").update({ value: Math.min(max, Math.max(min, n)), updated_at: now, updated_by: me.id }).eq("key", key);
  }
  for (const key of FLAGS) {
    await supabase.from("rms_settings").update({ value: form.get(key) === "on", updated_at: now, updated_by: me.id }).eq("key", key);
  }
  revalidatePath("/", "layout");
}
