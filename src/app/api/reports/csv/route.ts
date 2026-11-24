import { apiContext } from "@/lib/api";
import { filtersFromParams, searchRecords } from "@/lib/search";
import { PRIORITY_LABEL, STATUS_LABEL, partyLabel } from "@/lib/labels";

function cell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Prevent spreadsheet formula injection and quote every field.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const ctx = await apiContext();
  if ("error" in ctx) return ctx.error;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const [rows, { data: offices }] = await Promise.all([
    searchRecords(ctx.supabase, filtersFromParams(sp), 200),
    ctx.supabase.from("rms_offices").select("code, name"),
  ]);
  const officeNames = new Map((offices ?? []).map((o) => [o.code, o.name]));
  // Excel-friendly: plain words, Manila dates and times, and a byte-order mark so ñ and dashes show correctly.
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso));
  const stamp = (iso: string) => {
    const d = new Date(iso);
    const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return `${day(iso)} ${t}`;
  };
  const header = ["Tracking no.", "Direction", "Subject", "Type", "Transaction type", "Status", "Priority", "Current office", "Origin office", "From", "To", "Registered by", "Registered (Manila time)", "Due date"];
  const lines = rows.map((r) =>
    [
      r.tracking_no,
      r.direction === "incoming" ? "Received" : "Sent out",
      r.subject,
      r.document_type,
      r.transaction_type ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      PRIORITY_LABEL[r.priority] ?? r.priority,
      officeNames.get(r.current_office) ?? r.current_office,
      officeNames.get(r.origin_office) ?? r.origin_office,
      partyLabel(r.sender_name, r.sender_org),
      partyLabel(r.recipient_name, r.recipient_org),
      r.created_by_name,
      stamp(r.created_at),
      r.due_date,
    ]
      .map(cell)
      .join(","),
  );
  await ctx.supabase.rpc("rms_log_event", { p_table: "export_csv", p_row_id: "records", p_data: { filters: sp, rows: rows.length } });
  return new Response("\uFEFF" + [header.map(cell).join(","), ...lines].join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rms-records-${day(new Date().toISOString())}.csv"`,
    },
  });
}
