import { apiContext } from "@/lib/api";
import { filtersFromParams, searchRecords } from "@/lib/search";
import { partyLabel } from "@/lib/labels";

function cell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Prevent spreadsheet formula injection and quote every field.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await searchRecords(ctx.supabase, filtersFromParams(sp), 200);
  const header = ["Tracking no.", "Direction", "Subject", "Type", "Status", "Priority", "Current office", "Origin office", "From", "To", "Registered by", "Registered at", "Due date"];
  const lines = rows.map((r) =>
    [r.tracking_no, r.direction, r.subject, r.document_type, r.status, r.priority, r.current_office, r.origin_office, partyLabel(r.sender_name, r.sender_org), partyLabel(r.recipient_name, r.recipient_org), r.created_by_name, r.created_at, r.due_date]
      .map(cell)
      .join(","),
  );
  await ctx.supabase.rpc("rms_log_event", { p_table: "export_csv", p_row_id: "records", p_data: { filters: sp, rows: rows.length } });
  return new Response([header.map(cell).join(","), ...lines].join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rms-records-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
