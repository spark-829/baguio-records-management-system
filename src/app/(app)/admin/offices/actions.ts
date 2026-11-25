"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { RECOMMENDED, parseFeatureForm } from "@/lib/office-features";

export async function saveOfficeFeatures(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const code = String(form.get("code") ?? "");
  if (!/^[A-Z-]{2,10}$/.test(code)) redirect("/admin/offices");
  const features = form.get("recommended") === "1" && RECOMMENDED[code]
    ? RECOMMENDED[code]
    : parseFeatureForm(code, form.getAll("feature"));
  const supabase = await createClient();
  const { error } = await supabase.from("rms_offices").update({ features }).eq("code", code);
  if (error) redirect(`/admin/offices/${encodeURIComponent(code)}?error=1`);
  revalidatePath("/", "layout");
  redirect(`/admin/offices/${encodeURIComponent(code)}?saved=1`);
}
