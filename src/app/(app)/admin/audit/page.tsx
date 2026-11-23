import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, STATUS_LABEL, fmtDateTime } from "@/lib/labels";
import { integrityErrorText, routeText, checkCoverageText, type CheckInfo, type RouteLookups } from "@/lib/audit-text";
import type { Role, Status } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const st = (s: unknown) => STATUS_LABEL[s as Status] ?? String(s ?? "");

const TABLE_LABEL: Record<string, string> = {
  rms_records: "Record",
  rms_routes: "Routing / action",
  rms_attachments: "Attachment",
  rms_profiles: "User",
  rms_offices: "Office",
  rms_document_types: "Document type",
  ai_intake: "Form filled from a scan",
  ai_chat: "AI assistant question",
  ai_summary: "AI summary",
  export_csv: "List downloaded (CSV)",
  download: "File download",
  rms_settings: "Security setting",
};

function describe(table: string, action: string, data: Record<string, unknown> | null, old: Record<string, unknown> | null, lk: RouteLookups) {
  const d = data ?? old ?? {};
  switch (table) {
    case "rms_records":
      if (action === "UPDATE" && old && data && !old.deleted_at && data.deleted_at) return `${d.tracking_no}: moved to bin (“${data.delete_reason}”)`;
      if (action === "UPDATE" && old && data && old.deleted_at && !data.deleted_at) return `${d.tracking_no}: restored from bin`;
      return action === "UPDATE" && old && data && old.status !== data.status
        ? `${d.tracking_no}: ${st(old.status)} → ${st(data.status)}`
        : `${d.tracking_no ?? ""} ${d.subject ?? ""}`;
    case "rms_routes":
      return routeText(d, lk);
    case "rms_attachments":
      return String(d.file_name ?? "");
    case "rms_profiles":
      return `${d.full_name} · ${ROLE_LABEL[d.role as Role] ?? d.role}${d.is_active === false ? " · deactivated" : ""}`;
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

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ t?: string; table?: string; more?: string }> }) {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const sp = await searchParams;
  const table = sp.table ?? sp.t;
  const more = sp.more;
  const { t } = await getT();
  const limit = more ? 500 : 50;
  const supabase = await createClient();
  let q = supabase.from("rms_audit_log").select("id, table_name, row_id, action, old_data, new_data, actor_id, created_at, ip").order("created_at", { ascending: false }).limit(limit);
  if (table) q = q.eq("table_name", table);
  const [{ data: rows }, { data: people }, chain] = await Promise.all([
    q,
    supabase.from("rms_profiles").select("id, full_name"),
    supabase.rpc("rms_verify_audit_chain"),
  ]);
  if (chain.error) console.error("rms_verify_audit_chain failed:", chain.error);
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  // After the verify call, so the coverage numbers include what it just checked. Left out if it fails.
  let coverage: ReturnType<typeof checkCoverageText> | null = null;
  if (!chain.error && chain.data === null) {
    const { data: info, error: infoErr } = await supabase.rpc("rms_audit_check_info");
    if (!infoErr && info) coverage = checkCoverageText(info as CheckInfo, fmtDateTime);
  }

  // Routing rows only hold ids; look up tracking numbers and office names in batches.
  const routeRows = (rows ?? []).filter((r) => r.table_name === "rms_routes");
  const recordIds = [
    ...new Set(
      routeRows
        .map((r) => String(((r.new_data ?? r.old_data) as Record<string, unknown> | null)?.record_id ?? ""))
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
  const chunks: string[][] = [];
  for (let i = 0; i < recordIds.length; i += 100) chunks.push(recordIds.slice(i, i + 100));
  const [recordLookups, officeLookup] = await Promise.all([
    Promise.all(chunks.map((c) => supabase.from("rms_records").select("id, tracking_no").in("id", c))),
    routeRows.length > 0 ? supabase.from("rms_offices").select("id, name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const lk: RouteLookups = {
    tracking: new Map(recordLookups.flatMap((res) => (res.data ?? []).map((x) => [x.id, x.tracking_no] as [string, string]))),
    offices: new Map((officeLookup.data ?? []).map((o) => [o.id, o.name] as [string, string])),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Audit log")}</h1>
          <p className="text-sm text-slate-600">{t("Every change, download and assistant use, recorded automatically. Nobody can edit or delete entries.")}</p>
        </div>
        <form method="get" className="flex gap-2">
          <label htmlFor="audit-t" className="sr-only">{t("Show")}</label>
          <select id="audit-t" name="t" defaultValue={table ?? ""} className="input">
            <option value="">{t("All entries")}</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className="btn-secondary">{t("Filter")}</button>
        </form>
      </div>
      {chain.error ? (
        <p className="rounded-lg border border-l-4 border-amber-300 border-l-amber-700 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t(integrityErrorText(chain.error))}</p>
      ) : chain.data === null ? (
        <p className="rounded-lg border border-l-4 border-emerald-300 border-l-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t("Integrity check passed. Each entry is sealed with a digital fingerprint of the one before it, and the chain has no gaps, so no entry has been removed.")}
          {coverage && <> {t(coverage.key, coverage.vars)}</>}
        </p>
      ) : (
        <p className="rounded-lg border border-l-4 border-red-300 border-l-red-700 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {t("Integrity check FAILED at entry #{n}. The log was changed outside the system from that point on.", { n: String(chain.data) })}
        </p>
      )}
      <section className="card overflow-x-auto" tabIndex={0} aria-label={t("Audit entries (scroll sideways for more columns)")}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr><th className="px-3 py-2">{t("When")}</th><th className="px-3 py-2">{t("Who")}</th><th className="px-3 py-2">{t("What")}</th><th className="px-3 py-2">{t("Change")}</th><th className="px-3 py-2">{t("Details")}</th><th className="px-3 py-2">{t("Computer (IP address)")}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{r.actor_id ? names.get(r.actor_id) ?? "—" : t("System")}</td>
                <td className="px-3 py-2">{t(TABLE_LABEL[r.table_name] ?? r.table_name)}</td>
                <td className="px-3 py-2">{t(r.action === "INSERT" ? "Added" : r.action === "UPDATE" ? "Changed" : "Removed")}</td>
                <td className="px-3 py-2 text-slate-700">{describe(r.table_name, r.action, r.new_data, r.old_data, lk)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {(rows ?? []).length >= limit && !more && (
        <p>
          <Link className="btn-secondary" href={`/admin/audit?${new URLSearchParams({ ...(table ? { t: table } : {}), more: "1" })}`}>
            {t("Show older entries")}
          </Link>
        </p>
      )}
    </div>
  );
}
