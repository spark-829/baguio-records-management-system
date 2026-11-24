import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { manilaDay } from "@/lib/arta";
import { boxPrefix, nextBoxCode } from "@/lib/boxes";
import { BoxForm } from "../box-form";

export const metadata = { title: "Add a box" };

export default async function NewBoxPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "records_officer") redirect("/");
  const supabase = await createClient();
  const prefix = boxPrefix(me.office?.code ?? "BOX", Number(manilaDay().slice(0, 4)));
  const [{ data: offices }, { data: codes }, { data: roomRows }] = await Promise.all([
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("rms_boxes").select("code").ilike("code", `${prefix}-%`).limit(1000),
    supabase.from("rms_boxes").select("room").limit(1000),
  ]);
  const rooms = [...new Set((roomRows ?? []).map((r) => r.room as string))].sort();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("Add a box")}</h1>
      <BoxForm
        initial={{ code: nextBoxCode(prefix, (codes ?? []).map((c) => c.code)), office_id: me.office_id ?? "", room: "", shelf: "", contents: "", year_from: "", year_to: "", notes: "" }}
        offices={offices ?? []}
        rooms={rooms}
        cancelHref="/boxes"
      />
    </div>
  );
}
