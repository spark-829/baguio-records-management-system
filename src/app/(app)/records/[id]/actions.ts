"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ACTIONS, allowedActions, nextStatus, type ActionKind } from "@/lib/workflow";
import type { Direction, Status } from "@/lib/types";

export type ActState = { error?: string; ok?: string } | undefined;

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
    .select("id, status, direction, current_office_id")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return { error: "Record not found" };

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

  const { error } = await supabase.from("rms_routes").insert({
    record_id: rec.id,
    from_office_id: rec.current_office_id,
    to_office_id: kind === "forward" ? toOffice : rec.current_office_id,
    status: nextStatus(rec.status as Status, kind),
    action_taken: actionTaken || ACTIONS[kind].label,
    remarks: remarks || null,
    acted_by: me.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/records/${rec.id}`);
  return { ok: "Saved." };
}

export async function addAttachment(_prev: ActState, form: FormData): Promise<ActState> {
  const me = await getProfile();
  const recordId = String(form.get("record_id") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (file.size > 10 * 1024 * 1024) return { error: "File is larger than 10 MB" };
  const supabase = await createClient();
  const { count } = await supabase
    .from("rms_attachments")
    .select("id", { count: "exact", head: true })
    .eq("record_id", recordId)
    .eq("file_name", file.name);
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${recordId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from("rms-attachments").upload(path, file, { contentType: file.type });
  if (up.error) return { error: up.error.message };
  const { error } = await supabase.from("rms_attachments").insert({
    record_id: recordId,
    file_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    version: (count ?? 0) + 1,
    uploaded_by: me.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/records/${recordId}`);
  return { ok: "File attached." };
}
