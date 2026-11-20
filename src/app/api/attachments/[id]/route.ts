import { NextResponse } from "next/server";
import { apiContext } from "@/lib/api";

/** Redirects to a 60-second signed link, after the database confirms this user may see the attachment. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const { data: att } = await ctx.supabase.from("rms_attachments").select("file_path").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await ctx.supabase.storage.from("rms-attachments").createSignedUrl(att.file_path, 60);
  if (error || !data) return NextResponse.json({ error: "Could not open file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
