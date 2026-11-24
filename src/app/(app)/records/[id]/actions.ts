"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canAssign } from "@/lib/assign";
import { saveAttachment } from "@/lib/save-attachment";
import { ACTIONS, allowedActions, doneText, isAlreadyReceived, nextStatus, type ActionKind } from "@/lib/workflow";
import type { Direction, Status } from "@/lib/types";

const ALREADY_RECEIVED = "Already received.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActState = { error?: string; ok?: string; vars?: Record<string, string> } | undefined;

export async function recordAction(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  const kind = String(form.get("kind") ?? "") as ActionKind;
  const toOffice = String(form.get("to_office_id") ?? "") || null;
  const actionTaken = String(form.get("action_taken") ?? "").trim().slice(0, 300);
  const remarks = String(form.get("remarks") ?? "").trim().slice(0, 2000);
  if (!(kind in ACTIONS)) return { error: "Choose an action" };

  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("rms_records")
    .select("id, tracking_no, status, direction, current_office_id")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return { error: "Record not found" };
  const here = { status: rec.status as Status, role: me.role, userOfficeId: me.office_id, currentOfficeId: rec.current_office_id };
  if (kind === "receive" && isAlreadyReceived(here)) return { ok: ALREADY_RECEIVED };

  const allowed = allowedActions({
    status: rec.status as Status,
    direction: rec.direction as Direction,
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
  });
  if (!allowed.includes(kind)) return { error: "That action is not available for this record." };
  if (ACTIONS[kind].needsOffice && !toOffice) return { error: "Choose the office to forward to." };
  if (kind === "remark" && !actionTaken && !remarks) return { error: "Write the action taken or a remark." };

  const toName =
    kind === "forward" && toOffice
      ? (await supabase.from("rms_offices").select("name").eq("id", toOffice).maybeSingle()).data?.name
      : null;
  const { error } = await supabase.from("rms_routes").insert({
    record_id: rec.id,
    from_office_id: rec.current_office_id,
    to_office_id: kind === "forward" ? toOffice : rec.current_office_id,
    status: nextStatus(rec.status as Status, kind),
    action_taken: actionTaken || doneText(kind, toName),
    remarks: remarks || null,
    acted_by: me.id,
  });
  if (error) {
    if (kind === "receive") {
      const { data: now } = await supabase.from("rms_records").select("status, current_office_id").eq("id", rec.id).maybeSingle();
      if (now && isAlreadyReceived({ ...here, status: now.status as Status, currentOfficeId: now.current_office_id })) {
        revalidatePath(`/records/${rec.id}`);
        return { ok: ALREADY_RECEIVED };
      }
    }
    return { error: error.message };
  }
  revalidatePath(`/records/${rec.id}`);
  // QR receive: redirect on the server after the save so the page shows the confirmation (no client race).
  if (kind === "receive" && form.get("from") === "qr") {
    revalidatePath(`/r/${rec.tracking_no}`);
    redirect(`/r/${encodeURIComponent(rec.tracking_no)}?received=1`);
  }
  return { ok: "Saved." };
}

/** The head of the holding office (or the records desk) assigns a person. Saved as a history step; the database re-checks every rule. */
export async function assignRecord(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  const assignee = String(form.get("assignee") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  if (!UUID.test(assignee)) return { error: "Choose a staff member." };
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("rms_records")
    .select("id, status, current_office_id, deleted_at")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return { error: "Record not found" };
  const allowed = canAssign({
    role: me.role,
    userOfficeId: me.office_id,
    currentOfficeId: rec.current_office_id,
    status: rec.status as Status,
    deleted: Boolean(rec.deleted_at),
  });
  if (!allowed) return { error: "Only the head of the office holding this record, or the records desk, can assign it." };
  const { error } = await supabase.from("rms_routes").insert({
    record_id: rec.id,
    from_office_id: rec.current_office_id,
    to_office_id: rec.current_office_id,
    status: rec.status,
    action_taken: "Assigned",
    assigned_to: assignee,
    acted_by: me.id,
  });
  if (error) {
    if (/confidential/i.test(error.message)) return { error: "A confidential record can be assigned only to the office head." };
    if (/choose an active staff/i.test(error.message)) return { error: "Choose a staff member." };
    if (/only the head/i.test(error.message)) return { error: "Only the head of the office holding this record, or the records desk, can assign it." };
    return { error: error.message };
  }
  const { data: person } = await supabase.from("rms_profiles").select("full_name").eq("id", assignee).maybeSingle();
  const name = person?.full_name ?? "";
  revalidatePath(`/records/${rec.id}`);
  revalidatePath("/");
  return { ok: "Assigned to {name}.", vars: { name } };
}

export async function addAttachment(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  if (me.role === "admin") return { error: "Administrators do not add files to records." };
  const recordId = String(form.get("record_id") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (!UUID.test(recordId)) return { error: "Record not found" };
  const supabase = await createClient();
  const saved = await saveAttachment(supabase, {
    recordId,
    userId: me.id,
    file,
    thumb: form.get("thumb"),
    originalShaHint: form.get("original_sha256"),
    originalSize: form.get("original_size"),
    withVersion: true,
  });
  if ("error" in saved) return saved;
  revalidatePath(`/records/${recordId}`);
  return { ok: "File attached." };
}

/** Moves a record to the deleted-records bin (records desk or admin). An admin can restore it. */
export async function deleteRecord(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  if (me.role !== "admin" && me.role !== "records_officer") return { error: "Only the records desk or an admin can delete records." };
  const recordId = String(form.get("record_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Give a short reason for deleting." };
  const supabase = await createClient();
  const { data: rec } = await supabase.from("rms_records").select("tracking_no").eq("id", recordId).maybeSingle();
  const { error } = await supabase.rpc("rms_delete_record", { p_record_id: recordId, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath("/records");
  // The next page shows a banner naming the record, like Gmail's "moved to Trash" note (QA-012).
  const no = encodeURIComponent(rec?.tracking_no ?? "1");
  redirect(me.role === "admin" ? `/admin/bin?deleted=${no}` : `/records?deleted=${no}`);
}

export async function restoreRecord(form: FormData) {
  const me = await getProfile();
  if (me.role !== "admin") return;
  const recordId = String(form.get("record_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_restore_record", { p_record_id: recordId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bin");
  revalidatePath(`/records/${recordId}`);
}
