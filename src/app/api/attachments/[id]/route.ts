import { NextResponse } from "next/server";
import { apiContext } from "@/lib/api";
import { watermark } from "@/lib/watermark";

const fmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/**
 * Opens an attachment after the database confirms this user may see it. Every download is logged.
 * When the admin setting is on, PDFs and images are returned stamped "Viewed by <name>, <date>";
 * otherwise the user gets a link that expires in 60 seconds.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, me } = ctx;
  const { id } = await params;
  const { data: att } = await supabase
    .from("rms_attachments")
    .select("id, record_id, file_path, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    return new NextResponse(body as BodyInit, {
      headers: {
        "content-type": stamped ? "application/pdf" : att.mime_type,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
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
  const { data, error } = await supabase.storage.from("rms-attachments").createSignedUrl(att.file_path, 60);
  if (error || !data) return NextResponse.json({ error: "Could not open file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
