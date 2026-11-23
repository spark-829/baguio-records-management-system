import { NextResponse } from "next/server";
import { aiModel, intakeRequest } from "@/lib/ai";
import { PDF_NOTE, cacheGet, cachePut, runAi } from "@/lib/ai-gate";
import { cacheKey } from "@/lib/ai-budget";
import { intakeModelSchema, type IntakeResult } from "@/lib/ai-schemas";
import { DEMO_LABEL, demoIntake, isAiDemo } from "@/lib/ai-demo";
import { aiError, apiContext } from "@/lib/api";
import { deepseekConfig } from "@/lib/deepseek";
import { AI_IMAGE_MAX_BYTES, AI_IMAGE_MAX_DIMENSION, imageDimensions } from "@/lib/image-size";

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
  if (file.type.startsWith("image/") && file.size > AI_IMAGE_MAX_BYTES)
    return NextResponse.json({ error: "This scan is too large for AI reading. Scan again at a lower resolution or fill in the form by hand." }, { status: 413 });

  const [{ data: types }, { data: offices }] = await Promise.all([
    supabase.from("rms_document_types").select("name").eq("is_active", true).order("name"),
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
  ]);
  const typeNames = (types ?? []).map((t) => t.name);

  try {
    let demo = isAiDemo();
    let note: string | undefined;
    let cached = false;
    let fallback: string | undefined;
    let result: IntakeResult | undefined;
    if (!demo) {
      if (file.type === "application/pdf") return NextResponse.json({ error: PDF_NOTE }, { status: 422 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dims = imageDimensions(bytes);
      if (!dims || dims.width > AI_IMAGE_MAX_DIMENSION || dims.height > AI_IMAGE_MAX_DIMENSION)
        return NextResponse.json({ error: "This scan is too large for AI reading. Scan again at a lower resolution or fill in the form by hand." }, { status: 413 });
      const key = await cacheKey(deepseekConfig().apiKey, "intake", bytes);
      const hit = await cacheGet(supabase, key, intakeModelSchema(typeNames, (offices ?? []).map((o) => o.code)));
      if (hit) {
        result = hit;
        cached = true;
      } else {
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const out = await runAi(supabase, intakeRequest(`data:${file.type};base64,${btoa(binary)}`, typeNames, offices ?? []));
        if (out.mode === "ai") {
          result = out.data;
          await cachePut(supabase, key, "intake", out.data);
        } else {
          demo = true;
          note = out.note;
          fallback = out.reason;
        }
      }
    }
    if (demo || !result) {
      demo = true;
      result = demoIntake(file.name, typeNames, offices ?? []);
    }
    await supabase.rpc("rms_log_event", {
      p_table: "ai_intake",
      p_row_id: file.name,
      p_data: { model: demo ? "demo" : aiModel(), file: file.name, cached, fallback, suggestion: { ...result, extracted_text: undefined } },
    });
    return NextResponse.json({ ...result, demo, demo_label: demo ? DEMO_LABEL : undefined, note });
  } catch (err) {
    return aiError(err);
  }
}
