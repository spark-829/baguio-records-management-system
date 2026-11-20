import { NextResponse } from "next/server";
import { AI_MODEL, readDocument } from "@/lib/ai";
import { DEMO_LABEL, demoIntake, isAiDemo } from "@/lib/ai-demo";
import { aiError, apiContext } from "@/lib/api";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  if (ctx.me.role === "viewer") return NextResponse.json({ error: "Viewers cannot register records" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a PDF, PNG, JPG or WEBP file" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File is larger than 10 MB" }, { status: 400 });

  const [{ data: types }, { data: offices }] = await Promise.all([
    supabase.from("rms_document_types").select("name").eq("is_active", true).order("name"),
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
  ]);

  try {
    const demo = isAiDemo();
    let result;
    if (demo) {
      result = demoIntake(file.name, (types ?? []).map((t) => t.name), offices ?? []);
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      result = await readDocument({
        base64: btoa(binary),
        mimeType: file.type,
        docTypes: (types ?? []).map((t) => t.name),
        offices: offices ?? [],
      });
    }
    await supabase.rpc("rms_log_event", {
      p_table: "ai_intake",
      p_row_id: file.name,
      p_data: { model: demo ? "demo" : AI_MODEL, file: file.name, suggestion: { ...result, extracted_text: undefined } },
    });
    return NextResponse.json({ ...result, demo, demo_label: demo ? DEMO_LABEL : undefined });
  } catch (err) {
    return aiError(err);
  }
}
