"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { manilaDay } from "@/lib/arta";
import { boxPrefix, nextBoxCode, parseBoxForm, type BoxErrors, type BoxInput } from "@/lib/boxes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BoxState = { errors?: BoxErrors; vars?: Record<string, string>; values?: BoxInput; error?: string } | undefined;

/** Records desk only: add a box, or change one when `box_id` is sent. The database re-checks every rule. */
export async function saveBox(_prev: BoxState, form: FormData): Promise<BoxState> {
  const me = await getProfile();
  if (me.role !== "records_officer") return { error: "Only the records desk can add or change boxes." };
  const text = (k: string) => String(form.get(k) ?? "");
  const values: BoxInput = {
    code: text("code"),
    office_id: text("office_id"),
    room: text("room"),
    shelf: text("shelf"),
    contents: text("contents"),
    year_from: text("year_from"),
    year_to: text("year_to"),
    notes: text("notes"),
  };
  const boxId = text("box_id");
  if (boxId && !UUID.test(boxId)) return { error: "Box not found", values };
  const parsed = parseBoxForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  let savedId: string | undefined;
  let failure: { code?: string; message: string } | null = null;
  if (boxId) {
    const { data, error } = await supabase.from("rms_boxes").update({ ...parsed.value }).eq("id", boxId).select("id").maybeSingle();
    failure = error;
    savedId = data?.id;
    if (!error && !data) return { error: "Box not found", values };
  } else {
    const { data, error } = await supabase.from("rms_boxes").insert({ ...parsed.value }).select("id").single();
    failure = error;
    savedId = data?.id;
  }
  if (failure) {
    if (failure.code === "23505") {
      const { data: office } = await supabase.from("rms_offices").select("code").eq("id", parsed.value.office_id).maybeSingle();
      const prefix = boxPrefix(office?.code ?? "BOX", Number(manilaDay().slice(0, 4)));
      const { data: codes } = await supabase.from("rms_boxes").select("code").ilike("code", `${prefix}-%`).limit(1000);
      const next = nextBoxCode(prefix, (codes ?? []).map((c) => c.code));
      return { errors: { code: "That box code is already used. Try {next}." }, vars: { next }, values };
    }
    return { error: failure.message, values };
  }
  redirect(`/boxes/${savedId}?saved=1`);
}
