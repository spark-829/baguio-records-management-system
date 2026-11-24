import { apiContext } from "@/lib/api";
import { monthParam, parseSatisfactionReport, satisfactionCsv } from "@/lib/satisfaction";

export async function GET(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const { role } = ctx.me;
  if (!(role === "admin" || role === "records_officer" || role === "dept_head")) {
    return new Response(JSON.stringify({ error: "Not allowed" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  const month = monthParam(new URL(req.url).searchParams.get("month") ?? undefined);
  const { data, error } = await ctx.supabase.rpc("rms_report_satisfaction", { p_month: `${month}-01` });
  if (error) return new Response(JSON.stringify({ error: "Report failed" }), { status: 500, headers: { "content-type": "application/json" } });
  await ctx.supabase.rpc("rms_log_event", { p_table: "export_csv", p_row_id: "satisfaction", p_data: { month } });
  return new Response(satisfactionCsv(parseSatisfactionReport(data), month), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rms-satisfaction-${month}.csv"`,
    },
  });
}
