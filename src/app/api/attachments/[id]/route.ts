import { NextResponse } from "next/server";
import { apiContext } from "@/lib/api";
import { watermark } from "@/lib/watermark";

/** Only these file types are ever served as themselves; anything else is sent as a plain download. */
const SAFE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/**
 * Opens an attachment after the database confirms this user may see it. Every download is logged.
 * When the admin setting is on, PDFs and images are returned stamped "Viewed by <name>, <date>";
 * otherwise the user gets a link that expires in 60 seconds.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, me } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: att } = await supabase
    .from("rms_attachments")
    .select("id, record_id, file_path, file_name, mime_type, thumb_path")
    .eq("id", id)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Thumbnail for the record page. Not logged here: the record page already logs view_record (page.tsx:80).
  if (new URL(req.url).searchParams.get("thumb") === "1") {
    if (!att.thumb_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: tb, error: tErr } = await supabase.storage.from("rms-attachments").download(att.thumb_path);
    if (tErr || !tb) return NextResponse.json({ error: "Could not open file" }, { status: 500 });
    return new NextResponse(await tb.arrayBuffer(), {
      headers: {
        "content-type": "image/jpeg",
        "content-disposition": "inline",
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  }

  const { data: setting } = await supabase.from("rms_settings").select("value").eq("key", "watermark_downloads").maybeSingle();
  const stamp = setting?.value !== false;

  if (stamp) {
    const { data: blob, error } = await supabase.storage.from("rms-attachments").download(att.file_path);
    if (error || !blob) return NextResponse.json({ error: "Could not open file" }, { status: 500 });
    const text = `Viewed by ${me.full_name}, ${fmt.format(new Date())}`;
    const stamped = await watermark(new Uint8Array(await blob.arrayBuffer()), att.mime_type, text).catch(() => null);
    const logged = await supabase.rpc("rms_log_access", {
      p_event: "download",
      p_record_id: att.record_id,
      p_attachment_id: att.id,
      p_detail: { file: att.file_name, watermarked: Boolean(stamped) },
    });
    if (logged.error) return NextResponse.json({ error: "Could not log download" }, { status: 500 });
    const body = stamped ?? new Uint8Array(await blob.arrayBuffer());
    const name = stamped && att.mime_type !== "application/pdf" ? att.file_name.replace(/\.[^.]+$/, "") + ".pdf" : att.file_name;
    // A file whose stored type is not on the safe list (for example one saved as text/html through the
    // API) is never shown in the browser: it downloads as raw bytes, and the sandbox blocks any script.
    const safe = stamped !== null || SAFE_TYPES.has(att.mime_type);
    return new NextResponse(body as BodyInit, {
      headers: {
        "content-type": stamped ? "application/pdf" : safe ? att.mime_type : "application/octet-stream",
        "content-disposition": `${safe ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        ...(safe ? {} : { "content-security-policy": "default-src 'none'; sandbox" }),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const logged = await supabase.rpc("rms_log_access", {
    p_event: "download",
    p_record_id: att.record_id,
    p_attachment_id: att.id,
    p_detail: { file: att.file_name, watermarked: false },
  });
  if (logged.error) return NextResponse.json({ error: "Could not log download" }, { status: 500 });
  const { data, error } = await supabase.storage
    .from("rms-attachments")
    .createSignedUrl(att.file_path, 60, SAFE_TYPES.has(att.mime_type) ? undefined : { download: att.file_name });
  if (error || !data) return NextResponse.json({ error: "Could not open file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
