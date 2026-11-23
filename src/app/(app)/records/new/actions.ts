"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BARANGAYS } from "@/lib/baguio-map";
import { saveAttachment } from "@/lib/save-attachment";
import { checkUpload } from "@/lib/upload-policy";
import { artaDue, manilaDay } from "@/lib/arta";
import { parseReplyTo } from "@/lib/reply-to";

const RecordInput = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  subject: z.string().trim().min(3, "Subject is too short").max(300),
  description: z.string().trim().max(4000).optional(),
  document_type_id: z.uuid("Choose a document type"),
  category: z.string().trim().max(80).optional(),
  keywords: z.string().optional(),
  priority: z.enum(["low", "normal", "urgent"]),
  confidentiality: z.enum(["public", "internal", "confidential"]),
  sender_name: z.string().trim().max(200).optional(),
  sender_org: z.string().trim().max(200).optional(),
  recipient_name: z.string().trim().max(200).optional(),
  recipient_org: z.string().trim().max(200).optional(),
  mode: z.enum(["walk-in", "courier", "mail", "email", "internal"]).optional(),
  document_date: z.string().optional(),
  due_date: z.string().optional(),
  arta_class: z.enum(["simple", "complex", "highly_technical", "none"]).optional(),
  in_reply_to: z.string().trim().max(40).optional(),
  forward_to: z.string().optional(),
  content_text: z.string().max(200000).optional(),
  ai_summary: z.string().max(2000).optional(),
  barangay: z.string().refine((b) => BARANGAYS.some((x) => x.name === b), "Choose a barangay from the list").optional(),
});

export type RegisterState = { error?: string } | undefined;

const empty = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

export async function registerRecord(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const me = await getProfile();
  const parsed = RecordInput.safeParse(Object.fromEntries([...form.keys()].filter((k) => k !== "file").map((k) => [k, empty(form.get(k))])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  if (v.direction === "incoming" && !isCentral(me)) return { error: "Only the records desk registers incoming documents." };
  if (!me.office_id) return { error: "Your account has no office. Ask an administrator." };

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    const bad = checkUpload(file.type, file.size);
    if (bad) return { error: bad };
  }

  const supabase = await createClient();
  let replyTo: string | null = null;
  if (v.direction === "outgoing" && v.in_reply_to) {
    const tn = parseReplyTo(v.in_reply_to);
    if (!tn) return { error: "Type the tracking number of the received letter, for example IN-2026-0001." };
    const { data: parent } = await supabase.from("rms_records").select("id, direction").eq("tracking_no", tn).is("deleted_at", null).maybeSingle();
    if (!parent || parent.direction !== "incoming") return { error: "No received record with that tracking number that you can open. Check the number." };
    replyTo = parent.id;
  }
  const dueDate = v.due_date ?? (v.arta_class ? artaDue(v.arta_class, manilaDay()) : null);
  const { data: rec, error } = await supabase
    .from("rms_records")
    .insert({
      direction: v.direction,
      subject: v.subject,
      description: v.description ?? null,
      document_type_id: v.document_type_id,
      category: v.category ?? null,
      keywords: (v.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 12),
      priority: v.priority,
      confidentiality: v.confidentiality,
      sender_name: v.sender_name ?? null,
      sender_org: v.sender_org ?? null,
      recipient_name: v.recipient_name ?? null,
      recipient_org: v.recipient_org ?? null,
      mode: v.mode ?? null,
      document_date: v.document_date ?? null,
      due_date: dueDate,
      origin_office_id: me.office_id,
      current_office_id: me.office_id,
      content_text: v.content_text ?? null,
      ai_summary: v.ai_summary ?? null,
      ...(v.barangay ? { barangay: v.barangay } : {}),
      ...(v.arta_class ? { arta_class: v.arta_class } : {}),
      ...(replyTo ? { in_reply_to: replyTo } : {}),
      created_by: me.id,
      tracking_no: "pending",
    })
    .select("id, tracking_no")
    .single();
  if (error || !rec) return { error: error?.message ?? "Could not save the record" };

  let fileFailed = false;
  if (hasFile) {
    fileFailed =
      "error" in
      (await saveAttachment(supabase, {
        recordId: rec.id,
        userId: me.id,
        file,
        thumb: form.get("thumb"),
        originalShaHint: form.get("original_sha256"),
        originalSize: form.get("original_size"),
        withVersion: false,
      }));
  }

  if (v.forward_to && v.forward_to !== me.office_id) {
    await supabase.from("rms_routes").insert({
      record_id: rec.id,
      from_office_id: me.office_id,
      to_office_id: v.forward_to,
      status: "forwarded",
      action_taken: "Forwarded on registration",
      acted_by: me.id,
    });
  }
  redirect(`/records/${rec.id}?new=1${form.get("from_scan") === "1" ? "&scan=1" : ""}${fileFailed ? "&file=failed" : ""}`);
}
