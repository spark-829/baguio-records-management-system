import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { filtersFromParams, filtersToParams, searchRecords } from "@/lib/search";
import { STATUS_LABEL, fmtDate, partyLabel } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { ConfBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { AiSearchBox } from "./ai-search-box";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = filtersFromParams(sp);
  const supabase = await createClient();
  const [rows, offices, types] = await Promise.all([
    searchRecords(supabase, f, 100),
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
    supabase.from("rms_document_types").select("name").eq("is_active", true).order("name"),
  ]);
  const exportHref = `/api/reports/csv?${filtersToParams(f).toString()}`;
  const aiNote = typeof sp.ai === "string" ? sp.ai : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Records</h1>
          <p className="text-sm text-slate-600">{rows.length} record{rows.length === 1 ? "" : "s"} found</p>
        </div>
        <div className="flex gap-2">
          <a href={exportHref} className="btn-secondary">Export CSV</a>
          <Link href="/records/new" className="btn-primary">Register a record</Link>
        </div>
      </div>

      <AiSearchBox />
      {aiNote && <p className="rounded-lg border border-l-4 border-brand-200 border-l-brand-700 bg-brand-50 px-4 py-3 text-sm text-brand-900">Assistant applied: {aiNote}</p>}

      <form className="card grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-4" method="get">
        <div>
          <label className="label" htmlFor="q">Keywords or tracking no.</label>
          <input className="input" id="q" name="q" defaultValue={f.q} placeholder="e.g. drainage, IN-2026-0001" />
        </div>
        <div>
          <label className="label" htmlFor="person">Person or organization</label>
          <input className="input" id="person" name="person" defaultValue={f.person} placeholder="Sender, recipient or staff" />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="direction">Direction</label>
          <select className="input" id="direction" name="direction" defaultValue={f.direction ?? ""}>
            <option value="">Both</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="office">Office</label>
          <select className="input" id="office" name="office" defaultValue={f.office ?? ""}>
            <option value="">Any</option>
            {(offices.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Document type</label>
          <select className="input" id="type" name="type" defaultValue={f.docType ?? ""}>
            <option value="">Any</option>
            {(types.data ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <div>
            <label className="label" htmlFor="from">From</label>
            <input className="input" id="from" name="from" type="date" defaultValue={f.from} />
          </div>
          <div>
            <label className="label" htmlFor="to">To</label>
            <input className="input" id="to" name="to" type="date" defaultValue={f.to} />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 md:col-span-2 lg:col-span-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" name="overdue" value="1" defaultChecked={f.overdue} /> Overdue only
          </label>
          <div className="flex gap-2">
            <Link href="/records" className="btn-secondary">Clear</Link>
            <button className="btn-primary">Search</button>
          </div>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Tracking no.</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">From / To</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Office</th>
              <th className="px-4 py-2">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                  <Link href={`/records/${r.id}`} className="text-brand-700 hover:underline">{r.tracking_no}</Link>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/records/${r.id}`} className="font-medium hover:underline">{r.subject}</Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <PriorityBadge priority={r.priority} />
                    <ConfBadge level={r.confidentiality} />
                    {isOverdue(r.due_date, r.status) && <OverdueBadge />}
                  </div>
                </td>
                <td className="px-4 py-2 text-slate-600">{r.document_type}</td>
                <td className="px-4 py-2 text-slate-600">{r.direction === "incoming" ? partyLabel(r.sender_name, r.sender_org) : partyLabel(r.recipient_name, r.recipient_org)}</td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2 text-slate-600">{r.current_office}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No records match. Try fewer filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
