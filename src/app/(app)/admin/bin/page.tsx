import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import { restoreRecord } from "../../records/[id]/actions";

type Row = { id: string; tracking_no: string; subject: string; deleted_at: string; delete_reason: string | null; deleter: { full_name: string } | null };

export default async function BinPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select("id, tracking_no, subject, deleted_at, delete_reason, deleter:rms_profiles!rms_records_deleted_by_fkey(full_name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Deleted records bin</h1>
        <p className="text-sm text-slate-600">
          Deleted records are hidden from everyone else but never erased. Restoring puts a record back exactly as it was. Both are logged.
        </p>
      </div>
      {deleted && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Record moved to the bin.</p>}
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Record</th><th className="px-3 py-2">Deleted</th><th className="px-3 py-2">Reason</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Link href={`/records/${r.id}`} className="font-mono text-brand-700 hover:underline">{r.tracking_no}</Link>
                  <div className="text-slate-700">{r.subject}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.deleted_at)}<div className="text-xs">by {r.deleter?.full_name ?? "—"}</div></td>
                <td className="px-3 py-2">{r.delete_reason}</td>
                <td className="px-3 py-2 text-right">
                  <form action={restoreRecord}>
                    <input type="hidden" name="record_id" value={r.id} />
                    <button className="btn-secondary px-2 py-1 text-xs">Restore</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">The bin is empty.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
