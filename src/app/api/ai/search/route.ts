import { NextResponse } from "next/server";
import { DEMO_LABEL, demoFilters, isAiDemo, type DemoFilters } from "@/lib/ai-demo";
import type { SearchAi } from "@/lib/ai-schemas";
import { getSearchFilters } from "@/lib/ai-gate";
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
  const typeNames = (types ?? []).map((t) => t.name);
  try {
    let demo = isAiDemo();
    let note: string | undefined;
    const practice = (prefix: string) => {
      const d = demoFilters(query, offices ?? [], typeNames, ctx.me.office?.code);
      return { ...d, explanation: `${prefix} Looking for: ${d.explanation}` };
    };
    let f: DemoFilters | SearchAi;
    if (demo) {
      f = practice(`${DEMO_LABEL}.`);
    } else {
      const out = await getSearchFilters(supabase, query, offices ?? [], typeNames);
      if (out.mode === "ai") {
        f = out.data;
      } else {
        demo = true;
        note = out.note;
        f = practice(`${DEMO_LABEL}. ${out.note}`);
      }
    }
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
    return NextResponse.json({ params: params.toString(), explanation: f.explanation, demo, note });
  } catch (err) {
    return aiError(err);
  }
}
