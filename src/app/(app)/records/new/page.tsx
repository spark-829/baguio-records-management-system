import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BARANGAYS } from "@/lib/baguio-map";
import { parseReplyTo } from "@/lib/reply-to";
import { COPY_TYPE } from "@/lib/copy-request";
import { canWindowIntake, hasFeature, isRecordsDesk } from "@/lib/office-features";
import { DEFAULT_REF_LABEL } from "@/lib/reference-no";
import type { ServiceOpt } from "@/lib/charter";
import { RegisterForm } from "./register-form";
import { PrivacyNotice } from "@/components/privacy-notice";

export default async function NewRecordPage({ searchParams }: { searchParams: Promise<{ reply_to?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  const replyTo = parseReplyTo((await searchParams).reply_to);
  if (me.role === "viewer") redirect("/records");
  if (me.role === "admin") redirect("/");
  const supabase = await createClient();
  const central = isCentral(me);
  const desk = isRecordsDesk(me);
  const incomingMode = central ? "central" : canWindowIntake({ role: me.role, windowFlag: me.window_intake, features: me.office?.features }) ? "window" : null;
  const wantServices = central || hasFeature(me, "services");
  const SERVICE_COLS = "id, office_id, title, classification, tx_types, fee_text, fee_php, total_text, total_minutes, confidential, doc_type_name, sort_order";
  const [{ data: types }, { data: offices }, barangayCheck, { data: svcData }, { data: countData }] = await Promise.all([
    supabase.from("rms_document_types").select("id, name").eq("is_active", true).order("name"),
    supabase.from("rms_offices").select("id, code, name, ref_label").eq("is_active", true).order("code"),
    // The barangay box shows once the barangay database update has been run
    supabase.from("rms_records").select("barangay").limit(1),
    // Services only for incoming documents; steps stay on the server (the database copies them when the record is saved).
    wantServices && incomingMode && me.office_id
      ? (central
          ? supabase.from("rms_services").select(SERVICE_COLS).eq("is_active", true).order("sort_order")
          : supabase.from("rms_services").select(SERVICE_COLS).eq("is_active", true).eq("office_id", me.office_id).order("sort_order"))
      : Promise.resolve({ data: null }),
    wantServices && incomingMode && me.office_id && (!central || desk) ? supabase.rpc("rms_service_counts", { p_office: me.office_id }) : Promise.resolve({ data: null }),
  ]);
  const all = (svcData ?? []) as unknown as ServiceOpt[];
  // Central desk: its own (CGSO) services as radios, every other office's in the grouped select.
  const services = central ? all.filter((s) => s.office_id === me.office_id) : all;
  const otherServices = central ? all.filter((s) => s.office_id !== me.office_id) : [];
  const counts = Object.fromEntries(((countData ?? []) as { service_id: string; n: number }[]).map((c) => [c.service_id, Number(c.n)]));
  const myOffice = (offices ?? []).find((o) => o.id === me.office_id);
  const refLabel = !central && !hasFeature(me, "refno") ? null : (myOffice?.ref_label ?? DEFAULT_REF_LABEL);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Register a record")}</h1>
        <p className="text-sm text-slate-600">{t("Add the file if you have one, answer the questions, then save to get a tracking number.")}</p>
      </div>
      <RegisterForm types={(types ?? []).filter((x) => x.name !== COPY_TYPE || me.role === "records_officer")} offices={offices ?? []} incomingMode={incomingMode} myOfficeId={me.office_id} myOfficeName={me.office?.name ?? ""} refLabel={refLabel} services={services} otherServices={otherServices} counts={counts} desk={desk} replyTo={replyTo} barangays={barangayCheck.error ? null : BARANGAYS.map((b) => b.name)} />
      <PrivacyNotice where="register" />
    </div>
  );
}
