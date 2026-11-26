"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { changedSettings } from "@/lib/settings-diff";

const NUMBERS: Record<string, [number, number]> = {
  lockout_threshold: [3, 10],
  lockout_minutes: [5, 1440],
  idle_timeout_minutes: [5, 240],
};
const FLAGS = ["watermark_downloads"]; // ai_exclude_confidential is always on (QA-099)

export async function saveSettings(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") return;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: rows } = await supabase
    .from("rms_settings")
    .select("key, value")
    .in("key", [...Object.keys(NUMBERS), ...FLAGS]);
  const current: Record<string, unknown> = {};
  for (const r of rows ?? []) current[r.key as string] = r.value;

  const next: Record<string, number | boolean> = {};
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const n = Math.round(Number(form.get(key)));
    if (!Number.isFinite(n)) continue;
    next[key] = Math.min(max, Math.max(min, n));
  }
  for (const key of FLAGS) next[key] = form.get(key) === "on";

  for (const key of changedSettings(current, next)) {
    await supabase.from("rms_settings").update({ value: next[key], updated_at: now, updated_by: me.id }).eq("key", key);
  }
  revalidatePath("/", "layout");
}
