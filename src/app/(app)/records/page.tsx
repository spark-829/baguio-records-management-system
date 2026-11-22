import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import { filtersFromParams, filtersToParams, searchRecords } from "@/lib/search";
import { STATUS_LABEL, fmtDate, partyLabel } from "@/lib/labels";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { ConfBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { ScanQrButton } from "@/components/scan-qr-button";
import { AiSearchBox } from "./ai-search-box";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getT();
  const sp = await searchParams;
  const f = filtersFromParams(sp);
  // "Open only" comes from the dashboard boxes: hide finished records
  const onlyOpen = Boolean(f.open);
  const supabase = await createClient();
  const [me, rows, offices, types] = await Promise.all([
    getProfile(),
    searchRecords(supabase, f, 100),
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
    supabase.from("rms_document_types").select("name").eq("is_active", true).order("name"),
  ]);
  const exportHref = `/api/reports/csv?${filtersToParams(f).toString()}`;
  const aiNote = typeof sp.ai === "string" ? sp.ai : undefined;
  const officeNames = new Map((offices.data ?? []).map((o) => [o.code, o.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Records")}</h1>
          <p className="text-sm text-slate-600">
            {t(onlyOpen ? (rows.length === 1 ? "{n} open record found" : "{n} open records found") : rows.length === 1 ? "{n} record found" : "{n} records found", { n: rows.length })}
            {onlyOpen && (
              <>
                {" · "}
                <Link href={`/records?${filtersToParams({ ...f, open: false }).toString()}`}>{t("Show finished ones too")}</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScanQrButton />
          <a href={exportHref} className="btn-secondary" title={t("Opens in Excel")}>{t("Download list (CSV, opens in Excel)")}</a>
          {me.role !== "viewer" && <Link href="/records/new" className="btn-primary">{t("Register a record")}</Link>}
        </div>
      </div>

      {typeof sp.deleted === "string" && (
        <p role="status" className="rounded-lg border border-l-4 border-emerald-300 border-l-emerald-700 bg-emerald-50 px-4 py-3 text-emerald-900">
          {sp.deleted === "1"
            ? t("Record moved to the bin. An administrator can restore it.")
            : t("{no} was moved to the bin. An administrator can restore it.", { no: sp.deleted.slice(0, 20) })}
        </p>
      )}

      <AiSearchBox />
      {aiNote && <p className="rounded-lg border border-l-4 border-brand-200 border-l-brand-700 bg-brand-50 px-4 py-3 text-sm text-brand-900">{t("Assistant applied:")} {aiNote}</p>}

      <form className="card grid gap-4 p-5 md:grid-cols-4" method="get">
        <div className="md:col-span-3">
          <label className="label" htmlFor="q">{t("Search by word or tracking number")}</label>
          <input className="input" id="q" name="q" defaultValue={f.q} placeholder={t("e.g. drainage, IN-2026-0001")} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">{t("Search")}</button>
          <Link href="/records" className="btn-secondary">{t("Clear")}</Link>
        </div>
        <details className="md:col-span-4" open={Boolean(f.person || f.status || f.direction || f.office || f.docType || f.from || f.to || f.overdue || f.open || f.priority || f.here)}>
          <summary className="cursor-pointer py-1 font-medium text-brand-700">{t("More ways to narrow the list")}</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="person">{t("Person or organization")}</label>
          <input className="input" id="person" name="person" defaultValue={f.person} placeholder={t("Sender, recipient or staff")} />
        </div>
        <div>
          <label className="label" htmlFor="status">{t("Status")}</label>
          <select className="input" id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">{t("Any")}</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="direction">{t("Received or sent out")}</label>
          <select className="input" id="direction" name="direction" defaultValue={f.direction ?? ""}>
            <option value="">{t("Both")}</option>
            <option value="incoming">{t("Received by the City")}</option>
            <option value="outgoing">{t("Sent out by the City")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="office">{t("Office")}</label>
          <select className="input" id="office" name="office" defaultValue={f.office ?? ""}>
            <option value="">{t("Any")}</option>
            {(offices.data ?? []).map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">{t("Document type")}</label>
          <select className="input" id="type" name="type" defaultValue={f.docType ?? ""}>
            <option value="">{t("Any")}</option>
            {(types.data ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <div>
            <label className="label" htmlFor="from">{t("Logged from")}</label>
            <input className="input" id="from" name="from" type="date" defaultValue={f.from} />
          </div>
          <div>
            <label className="label" htmlFor="to">{t("Up to")}</label>
            <input className="input" id="to" name="to" type="date" defaultValue={f.to} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 md:col-span-2 lg:col-span-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" className="checkbox" name="overdue" value="1" defaultChecked={f.overdue} /> {t("Show only late (overdue) records")}
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" className="checkbox" name="open" value="1" defaultChecked={f.open} /> {t("Only ones still being handled")}
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" className="checkbox" name="priority" value="urgent" defaultChecked={f.priority === "urgent"} /> {t("Only urgent ones")}
          </label>
          {f.here && f.office && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
              <input type="checkbox" className="checkbox" name="here" value="1" defaultChecked /> {t("Only ones that are in this office now")}
            </label>
          )}
        </div>
          </div>
        </details>
      </form>

      <p className="text-sm text-slate-600">
        {t("For privacy, people's names are shortened in this list (for example “J*** dela C***”). Open a record to see the full name.")}
      </p>

      {/* Phones: one card per record, the whole card is a link */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/records/${r.id}`} className="card block p-4 no-underline hover:border-brand-600">
              <span className="font-mono text-sm text-slate-600">{r.tracking_no}</span>
              <span className="mt-1 block font-semibold text-ink">{r.subject}</span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={r.status} />
                <PriorityBadge priority={r.priority} />
                <ConfBadge level={r.confidentiality} />
                {isOverdue(r.due_date, r.status) && <OverdueBadge />}
              </span>
              <span className="mt-2 block text-sm text-slate-700">
                {t("Now with {office} · logged {date}", { office: officeNames.get(r.current_office) ?? r.current_office, date: fmtDate(r.created_at) })}
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="card p-6 text-center text-slate-600">{t("No records match. Try fewer filters.")}</li>}
      </ul>

      <div className="card hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th className="px-4 py-2">{t("Tracking no.")}</th>
              <th className="px-4 py-2">{t("Subject")}</th>
              <th className="hidden px-4 py-2 lg:table-cell">{t("Type")}</th>
              <th className="px-4 py-2">{t("From / To")}</th>
              <th className="px-4 py-2">{t("Status")}</th>
              <th className="px-4 py-2">{t("Office")}</th>
              <th className="px-4 py-2">{t("Logged on")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-sm">
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
                <td className="hidden px-4 py-2 text-slate-600 lg:table-cell">{r.document_type}</td>
                <td className="px-4 py-2 text-slate-600">{r.direction === "incoming" ? partyLabel(r.sender_name, r.sender_org) : partyLabel(r.recipient_name, r.recipient_org)}</td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2 text-slate-600">{officeNames.get(r.current_office) ?? r.current_office}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{t("No records match. Try fewer filters.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
