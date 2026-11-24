import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BoxForm } from "../../box-form";

export const metadata = { title: "Change box details" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditBoxPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  const me = await getProfile();
  if (me.role !== "records_officer") redirect("/");
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: box }, { data: offices }, { data: roomRows }] = await Promise.all([
    supabase.from("rms_boxes").select("id, code, office_id, room, shelf, contents, year_from, year_to, notes").eq("id", id).maybeSingle(),
    supabase.from("rms_offices").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("rms_boxes").select("room").limit(1000),
  ]);
  if (!box) notFound();
  const rooms = [...new Set((roomRows ?? []).map((r) => r.room as string))].sort();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("Change box details")}</h1>
      <BoxForm
        boxId={box.id}
        initial={{
          code: box.code,
          office_id: box.office_id,
          room: box.room,
          shelf: box.shelf ?? "",
          contents: box.contents ?? "",
          year_from: box.year_from ? String(box.year_from) : "",
          year_to: box.year_to ? String(box.year_to) : "",
          notes: box.notes ?? "",
        }}
        offices={offices ?? []}
        rooms={rooms}
        cancelHref={`/boxes/${box.id}`}
      />
    </div>
  );
}
