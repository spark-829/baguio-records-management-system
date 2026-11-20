import { NextResponse } from "next/server";
import { toFilters } from "@/lib/ai";
import { DEMO_LABEL, demoFilters, isAiDemo } from "@/lib/ai-demo";
import { aiError, apiContext } from "@/lib/api";
import { filtersToParams } from "@/lib/search";

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;
  const { query } = (await req.json()) as { query?: string };
  if (!query || query.length > 500) return NextResponse.json({ error: "Type a search request" }, { status: 400 });

  const [{ data: types }, { data: offices }] = await Promise.all([
    supabase.from("rms_document_types").select("name").eq("is_active", true),
    supabase.from("rms_offices").select("code, name").eq("is_active", true),
  ]);
  try {
    const demo = isAiDemo();
    const f = demo
      ? (() => {
          const d = demoFilters(query, offices ?? [], (types ?? []).map((t) => t.name), ctx.me.office?.code);
          return { ...d, explanation: `${DEMO_LABEL}. Looking for: ${d.explanation}` };
        })()
      : await toFilters(query, offices ?? [], (types ?? []).map((t) => t.name));
    const params = filtersToParams({
      q: f.q ?? undefined,
      person: f.person ?? undefined,
      direction: f.direction ?? undefined,
      status: f.status ?? undefined,
      office: f.office ?? undefined,
      docType: f.docType ?? undefined,
      from: f.from ?? undefined,
      to: f.to ?? undefined,
      overdue: f.overdue,
      open: "open" in f ? Boolean(f.open) : undefined,
      priority: "priority" in f ? (f.priority as "urgent" | undefined) : undefined,
    });
    return NextResponse.json({ params: params.toString(), explanation: f.explanation, demo });
  } catch (err) {
    return aiError(err);
  }
}
