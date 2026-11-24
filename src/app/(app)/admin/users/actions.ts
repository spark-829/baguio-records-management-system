"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type UserState = { error?: string; ok?: string } | undefined;

const NewUser = z.object({
  // The demo admin login is public, so new accounts are limited to the reserved test domain (QA-001).
  email: z.email("Enter a valid email").refine((e) => /@rms-demo\.test$/i.test(e.trim()), "In this demo, new accounts must use an @rms-demo.test email."),
  full_name: z.string().trim().min(3, "Enter the full name").max(120),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "records_officer", "dept_head", "staff", "viewer"]),
  office_id: z.uuid("Choose an office"),
});

export async function createUser(_prev: UserState, form: FormData): Promise<UserState> {
  const me = await getProfile();
  if (me.role !== "admin") return { error: "Only administrators can add users." };
  const parsed = NewUser.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_admin_create_user", {
    p_email: v.email,
    p_password: v.password,
    p_full_name: v.full_name,
    p_role: v.role,
    p_office_id: v.office_id,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: `Account created for ${v.email}.` };
}

export async function updateUser(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") return;
  const id = String(form.get("id"));
  const role = String(form.get("role"));
  const office_id = String(form.get("office_id"));
  const is_active = form.get("is_active") === "on";
  if (id === me.id && (!is_active || role !== "admin")) return; // never lock yourself out
  if (!["admin", "records_officer", "dept_head", "staff", "viewer"].includes(role)) return;
  const supabase = await createClient();
  const patch: { role: string; office_id: string; is_active: boolean; window_intake?: boolean } = { role, office_id, is_active };
  // The checkbox is only on the form when the office has the Office window feature on.
  if (form.get("window_shown") === "1") patch.window_intake = form.get("window_intake") === "on";
  await supabase.from("rms_profiles").update(patch).eq("id", id);
  revalidatePath("/admin/users");
}

export async function unlockUser(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") return;
  const supabase = await createClient();
  await supabase.rpc("rms_admin_unlock", { p_user_id: String(form.get("id")) });
  revalidatePath("/admin/users");
}
