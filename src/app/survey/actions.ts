"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseSurveyForm } from "@/lib/satisfaction";

const ident = z.object({ no: z.string().trim().min(1).max(20), code: z.string().trim().min(1).max(12) });

/** Public, anonymous. All checks (rate limit, one answer per record) are enforced again in rms_survey_submit. */
export async function submitSurvey(form: FormData) {
  const get = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : undefined);
  const id = ident.safeParse({ no: get("no"), code: get("code") });
  if (!id.success) redirect("/survey");
  const q = `no=${encodeURIComponent(id.data.no)}&code=${encodeURIComponent(id.data.code)}`;
  const parsed = parseSurveyForm({
    q_satisfied: get("q_satisfied"), q_time: get("q_time"), q_steps: get("q_steps"), q_fair: get("q_fair"), q_staff: get("q_staff"),
    saw_charter: get("saw_charter"), comment: get("comment"),
  });
  if (!parsed.ok) redirect(`/survey?${q}&err=choose`);
  const v = parsed.value;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_survey_submit", {
    p_tracking: id.data.no, p_code: id.data.code,
    p_satisfied: v.q_satisfied, p_time: v.q_time, p_steps: v.q_steps, p_fair: v.q_fair, p_staff: v.q_staff,
    p_saw_charter: v.saw_charter, p_comment: v.comment,
  });
  const res = (error ? { error: "not_found" } : data) as { ok?: boolean; error?: string };
  if (res.ok) redirect(`/survey?${q}&sent=1`);
  if (res.error === "already") redirect(`/survey?${q}&err=already`);
  redirect(`/survey?${q}&err=${res.error === "too_many" ? "too_many" : "not_found"}`);
}
