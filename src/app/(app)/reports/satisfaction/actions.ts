"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/office-features";
import { monthParam, parseSatisfactionReport, satisfactionCsv } from "@/lib/satisfaction";

const HRMO_NAME = "City Human Resource Management Office";

/** An office head sends the month's satisfaction summary to HRMO as an outgoing record routed to HRMO. */
export async function sendCssSummary(form: FormData) {
  const me = await getProfile();
  const month = monthParam(String(form.get("month") ?? ""));
  const back = `/reports/satisfaction?month=${month}`;
  if (me.role !== "dept_head" || !me.office_id || me.office?.code === "HRMO" || !hasFeature(me, "satisfaction")) redirect(back);
  const supabase = await createClient();

  // Never twice for the same month (a double click or a second visit).
  const { data: already } = await supabase
    .from("rms_records")
    .select("tracking_no")
    .eq("origin_office_id", me.office_id)
    .eq("category", "CSS summary")
    .contains("keywords", [`css-${month}`])
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (already) redirect(`${back}&sent=${encodeURIComponent(already.tracking_no)}`);

  const [{ data: hrmo }, { data: type }, { data: rep, error }] = await Promise.all([
    supabase.from("rms_offices").select("id").eq("code", "HRMO").maybeSingle(),
    supabase.from("rms_document_types").select("id").eq("name", "Report").maybeSingle(),
    supabase.rpc("rms_report_satisfaction", { p_month: `${month}-01` }),
  ]);
  if (error || !hrmo || !type) redirect(`${back}&failed=1`);
  const report = parseSatisfactionReport(rep);
  const csv = satisfactionCsv(report, month);
  const monthText = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const responses = report.offices.reduce((a, o) => a + o.responses, 0);

  // The CSV is kept as the record's text (searchable). The attachment rules allow PDF and images only, so it is not attached as a file.
  const { data: rec, error: insErr } = await supabase
    .from("rms_records")
    .insert({
      direction: "outgoing",
      subject: `Client satisfaction summary, ${monthText}, ${me.office?.name ?? ""}`,
      description: `${responses} responses for ${monthText}.`,
      document_type_id: type.id,
      transaction_type: "G2G",
      category: "CSS summary",
      keywords: ["css-summary", `css-${month}`],
      priority: "normal",
      confidentiality: "internal",
      recipient_org: HRMO_NAME,
      mode: "internal",
      origin_office_id: me.office_id,
      current_office_id: me.office_id,
      content_text: csv,
      created_by: me.id,
      tracking_no: "pending",
    })
    .select("id, tracking_no")
    .single();
  if (insErr || !rec) redirect(`${back}&failed=1`);

  await supabase.from("rms_routes").insert({
    record_id: rec.id,
    from_office_id: me.office_id,
    to_office_id: hrmo.id,
    status: "forwarded",
    action_taken: "Satisfaction summary sent to HRMO",
    acted_by: me.id,
  });
  revalidatePath("/reports/satisfaction");
  redirect(`${back}&sent=${encodeURIComponent(rec.tracking_no)}`);
}
