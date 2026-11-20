import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";

const TABLE_LABEL: Record<string, string> = {
  rms_records: "Record",
  rms_routes: "Routing / action",
  rms_attachments: "Attachment",
  rms_profiles: "User",
  rms_offices: "Office",
  rms_document_types: "Document type",
  ai_intake: "AI intake suggestion",
  ai_chat: "AI assistant question",
  ai_summary: "AI summary",
  export_csv: "CSV export",
  download: "File download",
  rms_settings: "Security setting",
};

function describe(table: string, action: string, data: Record<string, unknown> | null, old: Record<string, unknown> | null) {
  const d = data ?? old ?? {};
  switch (table) {
    case "rms_records":
      if (action === "UPDATE" && old && data && !old.deleted_at && data.deleted_at) return `${d.tracking_no}: moved to bin (“${data.delete_reason}”)`;
      if (action === "UPDATE" && old && data && old.deleted_at && !data.deleted_at) return `${d.tracking_no}: restored from bin`;
      return action === "UPDATE" && old && data && old.status !== data.status
        ? `${d.tracking_no}: status ${old.status} → ${data.status}`
        : `${d.tracking_no ?? ""} ${d.subject ?? ""}`;
    case "rms_routes":
      return `${d.status}: ${d.action_taken ?? ""}${d.remarks ? ` (“${d.remarks}”)` : ""}`;
    case "rms_attachments":
      return String(d.file_name ?? "");
    case "rms_profiles":
      return `${d.full_name} · ${d.role}${d.is_active === false ? " · deactivated" : ""}`;
    case "ai_chat":
      return `“${d.question}” → ${(d.records as string[] | undefined)?.join(", ") || "no records"}`;
    case "ai_intake":
      return `Suggested fields for ${d.file}`;
    case "ai_summary":
      return String(d.summary ?? "").slice(0, 140);
    case "export_csv":
      return `${d.rows} rows`;
    case "download":
      return `${d.file ?? "file"}${d.watermarked ? " (stamped)" : ""}`;
    case "rms_settings":
      return `${d.key} = ${JSON.stringify(d.value)}`;
    default:
      return "";
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const { t } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("rms_audit_log").select("id, table_name, row_id, action, old_data, new_data, actor_id, created_at, ip").order("created_at", { ascending: false }).limit(200);
  if (t) q = q.eq("table_name", t);
  const [{ data: rows }, { data: people }, chain] = await Promise.all([
    q,
    supabase.from("rms_profiles").select("id, full_name"),
    supabase.rpc("rms_verify_audit_chain"),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-slate-600">Every change, download and AI suggestion, written by the database. Nobody can edit or delete entries.</p>
        </div>
        <form method="get" className="flex gap-2">
          <select name="t" defaultValue={t ?? ""} className="input">
            <option value="">All entries</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>
      {chain.error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Could not check the log&apos;s integrity: {chain.error.message}</p>
      ) : chain.data === null ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Integrity check passed. Each entry carries a fingerprint (SHA-256) of the one before it, and the whole chain matches, so no entry has been altered or removed.
        </p>
      ) : (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          Integrity check FAILED at entry #{chain.data}. The log was changed outside the system from that point on.
        </p>
      )}
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{r.actor_id ? names.get(r.actor_id) ?? "—" : "System"}</td>
                <td className="px-3 py-2">{TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                <td className="px-3 py-2">{r.action === "INSERT" ? "Added" : r.action === "UPDATE" ? "Changed" : "Removed"}</td>
                <td className="px-3 py-2 text-slate-700">{describe(r.table_name, r.action, r.new_data, r.old_data)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
