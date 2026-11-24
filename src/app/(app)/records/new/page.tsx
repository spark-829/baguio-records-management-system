import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BARANGAYS } from "@/lib/baguio-map";
import { parseReplyTo } from "@/lib/reply-to";
import { COPY_TYPE } from "@/lib/copy-request";
import { RegisterForm } from "./register-form";

export default async function NewRecordPage({ searchParams }: { searchParams: Promise<{ reply_to?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  const replyTo = parseReplyTo((await searchParams).reply_to);
  if (me.role === "viewer") redirect("/records");
  if (me.role === "admin") redirect("/");
  const supabase = await createClient();
  const [{ data: types }, { data: offices }, barangayCheck] = await Promise.all([
    supabase.from("rms_document_types").select("id, name").eq("is_active", true).order("name"),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
    // The barangay box shows once the barangay database update has been run
    supabase.from("rms_records").select("barangay").limit(1),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Register a record")}</h1>
        <p className="text-sm text-slate-600">
          {t("Fill in the boxes below. If you have a scanned copy, the assistant can fill them in for you. Check every box, then press Save to get a tracking number.")}
        </p>
      </div>
      <RegisterForm types={(types ?? []).filter((x) => x.name !== COPY_TYPE || me.role === "records_officer")} offices={offices ?? []} canIncoming={isCentral(me)} myOfficeId={me.office_id} replyTo={replyTo} barangays={barangayCheck.error ? null : BARANGAYS.map((b) => b.name)} />
    </div>
  );
}
