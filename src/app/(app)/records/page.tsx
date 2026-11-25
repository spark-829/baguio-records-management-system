import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import { filtersFromParams, filtersToParams, searchRecordsPage } from "@/lib/search";
import { STATUS_LABEL, fmtDate, partyLabel } from "@/lib/labels";
import { foundText, listSize } from "@/lib/list-size";
import { listQuery } from "@/lib/back-link";
import { TX_CHIP_LABEL, TX_TYPES, type TxType } from "@/lib/transaction-type";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";
import { ConfBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { ScanQrButton } from "@/components/scan-qr-button";
import { AiSearchButton } from "./ai-search-box";
import { isOversight } from "@/lib/office-features";
import { maskedSubject, parseCityRows } from "@/lib/oversight";
import { ScopeLinks } from "../city-overview";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getT();
  const sp = await searchParams;
  const who = await getProfile();
  const oversight = isOversight({ role: who.role, officeCode: who.office?.code, features: who.office?.features });
  if (oversight && sp.scope === "city") return <CityRecords sp={sp} />;
  const f = filtersFromParams(sp);
  // "Open only" comes from the dashboard boxes: hide finished records
  const n = listSize(sp.n, 50, 500);
  const onlyOpen = Boolean(f.open);
  const supabase = await createClient();
  const [me, page, offices, types] = await Promise.all([
    getProfile(),
    searchRecordsPage(supabase, f, n),
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
    supabase.from("rms_document_types").select("name").eq("is_active", true).order("name"),
  ]);
  const rows = page.rows;
  const exportHref = `/api/reports/csv?${filtersToParams(f).toString()}`;
  const listQs = listQuery(f, n);
  const recordHref = (id: string) => `/records/${id}${listQs ? `?back=${encodeURIComponent(listQs)}` : ""}`;
  const aiNote = typeof sp.ai === "string" ? sp.ai : undefined;
  const officeNames = new Map((offices.data ?? []).map((o) => [o.code, o.name]));
  const narrowed = Boolean(f.at || f.person || f.status || f.direction || f.office || f.docType || f.from || f.to || f.overdue || f.open || f.priority || f.here || f.tx || f.box);
  const active = Boolean(f.q || aiNote || narrowed);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Records")}</h1>
          {oversight && <div className="my-2"><ScopeLinks base="/records" scope="mine" /></div>}
          {f.box && (
            <p className="text-lg font-semibold">
              {t("In box {code}").split("{code}")[0]}<span className="whitespace-nowrap font-mono">{f.box}</span>{t("In box {code}").split("{code}")[1]}
            </p>
          )}
          <p className="text-sm text-slate-600">
            {t(foundText(rows.length, page.more, onlyOpen), { n: rows.length })}
            {onlyOpen && (
              <>
                {" · "}
                <Link prefetch={false} href={`/records?${filtersToParams({ ...f, open: false }).toString()}`}>{t("Show finished ones too")}</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScanQrButton />
          <a href={exportHref} className="btn-secondary">{t("Download for Excel (CSV)")}</a>
          {me.role !== "viewer" && me.role !== "admin" && <Link prefetch={false} href="/records/new" className="btn-primary">{t("Register a record")}</Link>}
        </div>
      </div>

      {typeof sp.deleted === "string" && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
          {sp.deleted === "1"
            ? t("Record moved to the bin. An administrator can restore it.")
            : t("{no} was moved to the bin. An administrator can restore it.", { no: sp.deleted.slice(0, 20) })}
        </p>
      )}

      {aiNote && <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{t("Assistant applied:")} {aiNote}</p>}

      <form className="card space-y-4 p-5" method="get">
        {f.tx && <input type="hidden" name="tx" value={f.tx} />}
        <div>
          <label className="label" htmlFor="q">{t("Search records")}</label>
          <p id="q-hint" className="mb-2 text-sm text-slate-600">{t("Words, a name or a tracking number. You can also type a sentence and press Ask the assistant to find it.")} {t("…or a permit, voucher or tax declaration number")}</p>
          <input className="input" id="q" name="q" defaultValue={f.q} aria-describedby="q-hint" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary">{t("Search")}</button>
          <AiSearchButton inputId="q" />
          {active && (
            <Link prefetch={false} href="/records" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4">{t("Clear search")}</Link>
          )}
        </div>
        <details open={narrowed}>
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
          <label className="label" htmlFor="at">{t("Received at")}</label>
          <select className="input" id="at" name="at" defaultValue={f.at ?? ""}>
            <option value="">{t("Any")}</option>
            <option value="desk">{t("Records Section")}</option>
            <option value="window">{t("An office window")}</option>
          </select>
        </div>
        {me.role === "records_officer" && (
          <div>
            <label className="label" htmlFor="box">{t("Box code")}</label>
            <input className="input font-mono" id="box" name="box" defaultValue={f.box} autoComplete="off" />
          </div>
        )}
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

      <nav aria-label={t("Filter by transaction type")} className="flex flex-wrap gap-2">
        {([undefined, ...TX_TYPES] as (TxType | undefined)[]).map((tx) => {
          const on = f.tx === tx;
          const qs = filtersToParams({ ...f, tx }).toString();
          return (
            <Link
              key={tx ?? "all"}
              prefetch={false}
              href={`/records?${qs}`}
              aria-current={on ? "true" : undefined}
              className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-4 no-underline ${on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-ink hover:border-brand-600"}`}
            >
              {on && (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 10l4 4 8-8" /></svg>
              )}
              {tx ? t(TX_CHIP_LABEL[tx]) : t("All")}
            </Link>
          );
        })}
      </nav>

      {/* Phones: one card per record, the whole card is a link */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link prefetch={false} href={recordHref(r.id)} className="card block p-4 no-underline hover:border-brand-600">
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
              <th className="w-40 px-4 py-2">{t("Tracking no.")}</th>
              <th className="px-4 py-2">{t("Subject")}</th>
              <th className="hidden px-4 py-2 xl:table-cell">{t("Type")}</th>
              <th className="px-4 py-2">{t("From / To")}</th>
              <th className="px-4 py-2">{t("Status, now with")}</th>
              <th className="px-4 py-2">{t("Logged on")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="w-40 whitespace-nowrap px-4 py-2 font-mono text-sm">
                  <Link prefetch={false} href={recordHref(r.id)} className="inline-flex min-h-11 items-center text-brand-700 hover:underline">{r.tracking_no}</Link>
                </td>
                <td className="min-w-[18rem] px-4 py-2">
                  <Link prefetch={false} href={recordHref(r.id)} className="inline-block py-0.5 font-semibold text-ink hover:underline">{r.subject}</Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <PriorityBadge priority={r.priority} />
                    <ConfBadge level={r.confidentiality} />
                    {isOverdue(r.due_date, r.status) && <OverdueBadge />}
                  </div>
                </td>
                <td className="hidden px-4 py-2 text-slate-600 xl:table-cell">{r.document_type}</td>
                <td className="px-4 py-2 text-slate-600">{r.direction === "incoming" ? partyLabel(r.sender_name, r.sender_org) : partyLabel(r.recipient_name, r.recipient_org)}</td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /><div className="mt-1 text-sm text-slate-600">{officeNames.get(r.current_office) ?? r.current_office}</div></td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t("No records match. Try fewer filters.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-600">
        {t("For privacy, people's names are shortened in this list (for example “J*** dela C***”). Open a record to see the full name.")}
      </p>
      {page.more && n < 500 && (() => {
        const p = filtersToParams(f);
        p.set("n", String(n + 50));
        return (
          <p>
            <Link prefetch={false} href={`/records?${p}`} className="btn-secondary">{t("Show {n} more", { n: 50 })}</Link>
          </p>
        );
      })()}
    </div>
  );
}

/** City-wide read-only list for the CMO and CAO heads. Confidential records show no subject and no link. */
async function CityRecords({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { t } = await getT();
  const one = (k: string) => { const v = sp[k]; const x = Array.isArray(v) ? v[0] : v; return typeof x === "string" ? x.trim().slice(0, 100) : ""; };
  const q = one("q");
  const office = one("office");
  const late = one("late") === "1";
  const supabase = await createClient();
  const [{ data: offices }, { data, error }] = await Promise.all([
    supabase.from("rms_offices").select("code, name").eq("is_active", true).order("code"),
    supabase.rpc("rms_oversight_records", { p_q: q || null, p_office_code: office || null, p_late: late, p_limit: 50 }),
  ]);
  if (error) throw new Error("City records failed");
  const rows = parseCityRows(data);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("Records")}</h1>
      <ScopeLinks base="/records" scope="city" />
      <p className="text-sm text-slate-600">{t("All offices, read-only. Confidential subjects are hidden.")}</p>
      <form method="get" className="card grid gap-4 p-5 md:grid-cols-3">
        <input type="hidden" name="scope" value="city" />
        <div>
          <label className="label" htmlFor="city-q">{t("Search records")}</label>
          <input className="input" id="city-q" name="q" defaultValue={q} />
        </div>
        <div>
          <label className="label" htmlFor="city-office">{t("Office")}</label>
          <select className="input" id="city-office" name="office" defaultValue={office}>
            <option value="">{t("Any")}</option>
            {(offices ?? []).map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
          </select>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-base">
          <input type="checkbox" className="checkbox" name="late" value="1" defaultChecked={late} /> {t("Late only")}
        </label>
        <div className="md:col-span-3"><button className="btn-primary">{t("Search")}</button></div>
      </form>
      {rows.length === 0 ? (
        <p className="card p-5">{t("No records found.")}</p>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 px-4 py-3 sm:px-5">
              {r.confidential ? (
                <span className="font-semibold">{maskedSubject(r, t)}</span>
              ) : (
                <Link prefetch={false} href={`/records/${r.id}?scope=city`} className="inline-flex min-h-11 items-center font-semibold">{maskedSubject(r, t)}</Link>
              )}
              <span className="text-sm text-slate-600">
                <span className="font-mono">{r.tracking_no}</span> · {r.office} · {t(STATUS_LABEL[r.status] ?? r.status)}
                {r.due_date ? ` · ${t("Due {date}", { date: fmtDate(r.due_date) })}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
