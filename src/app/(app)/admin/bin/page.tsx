import { getT, pageTitle } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import { restoreRecord } from "../../records/[id]/actions";

// Confidential records come back with no subject: administrators can restore them but not read them (rms_admin_bin).
type Row = { id: string; tracking_no: string; subject: string | null; confidential: boolean; deleted_at: string; delete_reason: string | null; deleted_by_name: string | null };

export const generateMetadata = pageTitle("Deleted records bin");

export default async function BinPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { t, lang } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("rms_admin_bin");
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Deleted records bin")}</h1>
        <p className="text-sm text-slate-600">
          {t("Deleted records are hidden from everyone else but never erased. Restoring puts a record back exactly as it was. Both are logged.")}
        </p>
      </div>
      {deleted && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">{deleted === "1" ? t("Record moved to the bin.") : t("{no} was moved to the bin. You can restore it below.", { no: deleted.slice(0, 20) })}</p>}
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-sm font-semibold text-slate-600">
            <tr><th className="px-3 py-2">{t("Record")}</th><th className="px-3 py-2">{t("Deleted")}</th><th className="px-3 py-2">{t("Reason")}</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  {r.confidential ? (
                    <>
                      <span className="font-mono">{r.tracking_no}</span>
                      <div className="text-slate-600">{t("Confidential: subject hidden from administrators")}</div>
                    </>
                  ) : (
                    <>
                      <Link href={`/records/${r.id}`} className="tap-link font-mono text-brand-700 hover:underline">{r.tracking_no}</Link>
                      <div className="text-slate-700">{r.subject}</div>
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.deleted_at, lang)}<div className="text-xs">{t("by {name}", { name: r.deleted_by_name ?? "—" })}</div></td>
                <td className="px-3 py-2">{r.delete_reason}</td>
                <td className="px-3 py-2 text-right">
                  <form action={restoreRecord}>
                    <input type="hidden" name="record_id" value={r.id} />
                    <button className="btn-secondary px-2 py-1 text-xs">{t("Restore")}</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">{t("The bin is empty.")}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
