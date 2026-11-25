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
import { complaintDueDate, isComplaint } from "@/lib/complaint";
import { isCopyType, parseCopyForm, type CopyForm } from "@/lib/copy-request";
import { canWindowIntake, hasFeature } from "@/lib/office-features";
import { DEFAULT_REF_LABEL } from "@/lib/reference-no";

const RecordInput = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  subject: z.string().trim().min(3, "Subject is too short").max(300),
  description: z.string().trim().max(4000).optional(),
  document_type_id: z.uuid("Choose a document type"),
  transaction_type: z.enum(["G2C", "G2G", "G2B"], { error: "Choose the transaction type." }),
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
  service_id: z.uuid().optional(),
  reference_no: z.string().trim().max(40, "Keep the reference number under 40 characters.").optional(),
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
  if (
    v.direction === "incoming" &&
    !isCentral(me) &&
    !canWindowIntake({ role: me.role, windowFlag: me.window_intake, features: me.office?.features })
  ) {
    return { error: "Only the office window staff and the Records Section log documents received from outside. Ask your department head." };
  }
  if (me.role === "admin") return { error: "Administrators do not register records. The records desk does." };
  if (!me.office_id) return { error: "Your account has no office. Ask an administrator." };

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    const bad = checkUpload(file.type, file.size);
    if (bad) return { error: bad };
  }

  const extras = form.getAll("extra_file").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 4);
  for (const x of extras) {
    const bad = checkUpload(x.type, x.size);
    if (bad) return { error: bad };
  }

  const supabase = await createClient();
  if (v.service_id) {
    // A friendly message; the database guard is the real check.
    const { data: svc } = await supabase.from("rms_services").select("office_id").eq("id", v.service_id).maybeSingle();
    if (!svc) return { error: "choose a service from the Citizen's Charter list" };
    if (!isCentral(me) && svc.office_id !== me.office_id) return { error: "choose a service of your own office" };
  }
  // The label of the reference number follows the office that will hold the document.
  let refLabel: string | null = null;
  if (v.reference_no) {
    if (!isCentral(me) && !hasFeature(me, "refno")) return { error: "The reference number box is turned off for your office." };
    const labelOffice = isCentral(me) && v.forward_to ? v.forward_to : me.office_id;
    const { data: lo } = await supabase.from("rms_offices").select("ref_label").eq("id", labelOffice).maybeSingle();
    refLabel = lo?.ref_label ?? DEFAULT_REF_LABEL;
  }
  let replyTo: string | null = null;
  if (v.direction === "outgoing" && v.in_reply_to) {
    const tn = parseReplyTo(v.in_reply_to);
    if (!tn) return { error: "Type the tracking number of the received letter, for example IN-2026-0001." };
    const { data: parent } = await supabase.from("rms_records").select("id, direction").eq("tracking_no", tn).is("deleted_at", null).maybeSingle();
    if (!parent || parent.direction !== "incoming") return { error: "No received record with that tracking number that you can open. Check the number." };
    replyTo = parent.id;
  }
  let dueDate = v.due_date ?? (v.arta_class ? artaDue(v.arta_class, manilaDay()) : null);
  const { data: dt } = await supabase.from("rms_document_types").select("name").eq("id", v.document_type_id).maybeSingle();
  if (!v.due_date && isComplaint(dt?.name)) dueDate = complaintDueDate(new Date().toISOString());
  let copy: CopyForm | null = null;
  if (isCopyType(dt?.name)) {
    if (!isCentral(me)) return { error: "Only the records desk registers a request for copy." };
    const pc = parseCopyForm(Object.fromEntries([...form.keys()].filter((k) => k !== "file").map((k) => [k, form.get(k)])));
    if ("error" in pc) return { error: pc.error };
    const { data: src } = await supabase.from("rms_records").select("id").eq("tracking_no", pc.value.source_tracking_no).is("deleted_at", null).maybeSingle();
    if (!src) return { error: "No record with that tracking number. Check the number." };
    copy = pc.value;
  }
  const { data: rec, error } = await supabase
    .from("rms_records")
    .insert({
      direction: v.direction,
      subject: v.subject,
      description: v.description ?? null,
      document_type_id: v.document_type_id,
      transaction_type: v.transaction_type,
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
      ...(v.service_id ? { service_id: v.service_id } : {}),
      ...(v.reference_no ? { reference_no: v.reference_no, reference_label: refLabel } : {}),
      created_by: me.id,
      tracking_no: "pending",
    })
    .select("id, tracking_no")
    .single();
  if (error || !rec) return { error: error?.message ?? "Could not save the record" };

  let copyFailed = false;
  if (copy) {
    const { error: copyErr } = await supabase.from("rms_copy_requests").insert({ record_id: rec.id, ...copy, created_by: me.id });
    copyFailed = !!copyErr;
  }

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

  for (const x of extras) {
    const r = await saveAttachment(supabase, { recordId: rec.id, userId: me.id, file: x, thumb: null, originalShaHint: null, originalSize: null, withVersion: false });
    if ("error" in r) fileFailed = true;
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
  redirect(`/records/${rec.id}?new=1${form.get("from_scan") === "1" ? "&scan=1" : ""}${fileFailed ? "&file=failed" : ""}${copyFailed ? "&copy=failed" : ""}`);
}
