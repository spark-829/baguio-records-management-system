import { NextResponse } from "next/server";
import { apiContext } from "@/lib/api";
import { parseAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** The bell: records sent to my office and not yet received, plus late open ones. */
export async function GET() {
  const ctx = await apiContext();
  if ("error" in ctx) {
    const res = ctx.error as NextResponse;
    res.headers.set("cache-control", "no-store");
    return res;
  }
  if (!ctx.me.office_id) return NextResponse.json(parseAlerts(null), { headers: NO_STORE });
  const { data, error } = await ctx.supabase.rpc("rms_my_alerts", { p_limit: 8 });
  if (error) return NextResponse.json({ error: "Could not load alerts" }, { status: 500, headers: NO_STORE });
  return NextResponse.json(parseAlerts(data), { headers: NO_STORE });
}
