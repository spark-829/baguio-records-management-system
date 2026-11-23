import type { createClient } from "@/lib/supabase/server";
import { checkUpload, duplicateOf, isSha256Hex, isValidThumb, parseOriginalSize, thumbPath, toHex } from "@/lib/upload-policy";

export const NO_ATTACH = "Only the office holding this record, the office that sent it, or the records desk can add files.";

type Client = Awaited<ReturnType<typeof createClient>>;
export type SaveResult = { ok: true } | { error: string; vars?: Record<string, string> };

/** Shared by "register a record" and "attach a file": validate, hash, refuse duplicates, upload, insert, and clean up on failure. */
export async function saveAttachment(
  supabase: Client,
  o: {
    recordId: string;
    userId: string;
    file: File;
    thumb: FormDataEntryValue | null;
    originalShaHint: FormDataEntryValue | null;
    originalSize: FormDataEntryValue | null;
    withVersion: boolean;
  },
): Promise<SaveResult> {
  const { recordId, file } = o;
  const bad = checkUpload(file.type, file.size);
  if (bad) return { error: bad };

  const sha = toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const hint = isSha256Hex(o.originalShaHint) ? o.originalShaHint : null;

  const { data: rows } = await supabase.from("rms_attachments").select("file_name, sha256, original_sha256").eq("record_id", recordId);
  const existing = rows ?? [];
  const dup = duplicateOf(existing, [sha, hint]);
  if (dup) return { error: "This file is already attached as {name}.", vars: { name: dup } };
  const version = existing.filter((r) => r.file_name === file.name).length + 1;

  const bucket = supabase.storage.from("rms-attachments");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${recordId}/${crypto.randomUUID()}-${safeName}`;
  const up = await bucket.upload(path, file, { contentType: file.type });
  // Raw storage and row-security messages mean nothing to staff, so they get a plain sentence (QA-010).
  if (up.error) return { error: /row-level security|unauthorized|403/i.test(up.error.message) ? NO_ATTACH : "The file could not be uploaded. Please try again." };

  // The thumbnail is best effort: any problem just means the record shows a plain badge.
  let thumbPathValue: string | null = null;
  try {
    const thumb = o.thumb;
    if (thumb instanceof File && thumb.size > 0) {
      const head = new Uint8Array(await thumb.slice(0, 3).arrayBuffer());
      if (isValidThumb(thumb.type, thumb.size, head)) {
        const tp = thumbPath(recordId, crypto.randomUUID());
        const tu = await bucket.upload(tp, thumb, { contentType: "image/jpeg" });
        if (!tu.error) thumbPathValue = tp;
      }
    }
  } catch {
    thumbPathValue = null;
  }

  const { error } = await supabase.from("rms_attachments").insert({
    record_id: recordId,
    file_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    ...(o.withVersion ? { version } : {}),
    uploaded_by: o.userId,
    sha256: sha,
    original_sha256: hint ?? sha,
    original_size_bytes: parseOriginalSize(o.originalSize, file.size),
    thumb_path: thumbPathValue,
  });
  if (error) {
    try {
      await bucket.remove([path, thumbPathValue].filter((p): p is string => Boolean(p)));
    } catch {
      // Cleanup is best effort.
    }
    return { error: /row-level security/i.test(error.message) ? NO_ATTACH : "The file could not be saved. Please try again." };
  }
  return { ok: true };
}
