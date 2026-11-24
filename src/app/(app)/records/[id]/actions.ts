"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canAssign } from "@/lib/assign";
import { saveAttachment } from "@/lib/save-attachment";
import { ACTIONS, allowedActions, doneText, isAlreadyReceived, nextStatus, type ActionKind } from "@/lib/workflow";
import { manilaDay } from "@/lib/arta";
import { boxErrorText, isBoxCode, normalizeBoxCode } from "@/lib/boxes";
import { deliveryErrorText, firstError, parseDeliveryForm, parseReleaseForm, releaseErrorText } from "@/lib/dispatch";
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

  if (kind === "release") {
    const parsed = parseReleaseForm(
      { method: form.get("send_method"), courier: form.get("courier"), tracking: form.get("tracking_no"), sentOn: form.get("sent_on") },
      manilaDay(),
    );
    if (!parsed.ok) return { error: firstError(parsed.errors) };
    const v = parsed.value;
    const { error: relError } = await supabase.rpc("rms_release_record", {
      p_record_id: rec.id,
      p_method: v.method,
      p_courier: v.courier,
      p_tracking_no: v.tracking,
      p_sent_on: v.sentOn,
      p_note: [actionTaken, remarks].filter(Boolean).join("\n") || null,
    });
    if (relError) return { error: releaseErrorText(relError.message) };
    revalidatePath(`/records/${rec.id}`);
    return { ok: "Saved." };
  }
  if (kind === "archive") {
    // The box is saved first, so a wrong code stops the archive.
    const box = normalizeBoxCode(form.get("box_code"));
    if (box && me.role === "records_officer") {
      if (!isBoxCode(box)) return { error: "Type the code on the box label" };
      const { error: boxError } = await supabase.rpc("rms_set_record_box", { p_record_id: rec.id, p_box_code: box });
      if (boxError) return { error: boxErrorText(boxError.message) };
    }
  }

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

const COPY_ERRORS: [RegExp, string][] = [
  [/only the city legal officer/i, "Only the City Legal Officer (Data Privacy Officer) can decide."],
  [/send the request to the city legal office/i, "Send the request to the City Legal Office and mark it received first."],
  [/not waiting for approval/i, "This request is not waiting for approval."],
  [/reason of at least/i, "Give a reason of at least 5 characters for refusing."],
  [/after the data privacy officer approves/i, "You can release the copy after the Data Privacy Officer approves."],
  [/check the id of the person/i, "Check the ID of the person receiving a confidential copy."],
  [/name of the person/i, "Type the name of the person who received it."],
  [/no copy waiting/i, "This copy was already released."],
];
const copyError = (m: string) => COPY_ERRORS.find(([re]) => re.test(m))?.[1] ?? m;

export async function decideCopy(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  if (me.role !== "dept_head") return { error: "Only the City Legal Officer (Data Privacy Officer) can decide." };
  const approve = String(form.get("decision") ?? "") === "approve";
  const reason = String(form.get("reason") ?? "").trim().slice(0, 1000);
  if (!approve && reason.length < 5) return { error: "Give a reason of at least 5 characters for refusing." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_copy_decide", { p_record_id: recordId, p_approve: approve, p_reason: reason || undefined });
  if (error) return { error: copyError(error.message) };
  revalidatePath(`/records/${recordId}`);
  revalidatePath("/");
  return { ok: approve ? "Release approved." : "Release refused." };
}

export async function releaseCopy(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  if (me.role === "admin" || me.role === "viewer") return { error: "Only the records desk or the office holding the request can release the copy." };
  const name = String(form.get("received_by") ?? "").trim().slice(0, 200);
  if (name.length < 2) return { error: "Type the name of the person who received it." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_copy_release", { p_record_id: recordId, p_received_by: name, p_id_checked: form.get("id_checked") === "on" });
  if (error) return { error: copyError(error.message) };
  revalidatePath(`/records/${recordId}`);
  revalidatePath("/");
  return { ok: "Release recorded." };
}

/** Records desk only: put a record in a box, move it, or take it out. Saved as a history step; the database re-checks every rule. */
export async function moveRecordBox(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  if (me.role !== "records_officer") return { error: "Only the records desk can put records in boxes." };
  const recordId = String(form.get("record_id") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  const takeOut = form.get("take_out") === "on";
  const code = takeOut ? null : normalizeBoxCode(form.get("box_code"));
  if (!takeOut && !isBoxCode(code ?? "")) return { error: "Type the code on the box label" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_set_record_box", { p_record_id: recordId, p_box_code: code });
  if (error) return { error: boxErrorText(error.message) };
  if (data === false) return { ok: "No change: it is already in that box." };
  revalidatePath(`/records/${recordId}`);
  return { ok: "Saved." };
}

/** Records who received a record that was sent out. The page then shows "Delivery saved." */
export async function recordDelivery(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  if (me.role === "admin" || me.role === "viewer") return { error: "Only the records desk or the sending office can record delivery." };
  const recordId = String(form.get("record_id") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  const supabase = await createClient();
  const { data: dispatch } = await supabase.from("rms_dispatches").select("sent_on").eq("record_id", recordId).maybeSingle();
  if (!dispatch) return { error: "Delivery can be recorded only while the record is sent out." };
  const parsed = parseDeliveryForm(
    { receivedBy: form.get("received_by"), receivedOn: form.get("received_on"), note: form.get("note") },
    String(dispatch.sent_on),
    manilaDay(),
  );
  if (!parsed.ok) return { error: firstError(parsed.errors) };
  const { error } = await supabase.rpc("rms_record_delivery", {
    p_record_id: recordId,
    p_received_by: parsed.value.receivedBy,
    p_received_on: parsed.value.receivedOn,
    p_note: parsed.value.note,
  });
  if (error) return { error: deliveryErrorText(error.message) };
  revalidatePath(`/records/${recordId}`);
  redirect(`/records/${recordId}?delivered=1#sending`);
}

/** Mark a charter step done, or undo the last one within 10 minutes. The database re-checks every rule and saves a history line. */
const CHARTER_ERRORS: [RegExp, string][] = [
  [/mark the steps in order/i, "Mark the steps in order."],
  [/can no longer be undone/i, "This step can no longer be undone."],
  [/only the office holding/i, "Only the office holding this record can mark its charter steps."],
  [/no charter steps/i, "This record has no charter steps."],
  [/only while the office is working/i, "Charter steps can be marked only while the office is working on the record."],
  [/record not found/i, "Record not found"],
];

export async function markCharterStep(_prev: ActState, form: FormData): Promise<ActState> {
  await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  if (!UUID.test(recordId)) return { error: "Record not found" };
  const step = Number(form.get("step"));
  if (!Number.isInteger(step) || step < 1 || step > 50) return { error: "Choose a step." };
  const undo = form.get("undo") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("rms_mark_charter_step", { p_record_id: recordId, p_step: step, p_undo: undo });
  if (error) return { error: CHARTER_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "Could not save the step. Try again." };
  revalidatePath(`/records/${recordId}`);
  return undo ? { ok: "Step {n} is not done any more.", vars: { n: String(step) } } : { ok: "Step {n} marked done.", vars: { n: String(step) } };
}
