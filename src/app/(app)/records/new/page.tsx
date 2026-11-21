import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./register-form";

export default async function NewRecordPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role === "viewer") redirect("/records");
  const supabase = await createClient();
  const [{ data: types }, { data: offices }] = await Promise.all([
    supabase.from("rms_document_types").select("id, name").eq("is_active", true).order("name"),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Register a record")}</h1>
        <p className="text-sm text-slate-600">
          {t("Fill in the boxes below. If you have a scanned copy, the assistant can fill them in for you. Check every box, then press Save to get a tracking number.")}
        </p>
      </div>
      <RegisterForm types={types ?? []} offices={offices ?? []} canIncoming={isCentral(me)} myOfficeId={me.office_id} />
    </div>
  );
}
