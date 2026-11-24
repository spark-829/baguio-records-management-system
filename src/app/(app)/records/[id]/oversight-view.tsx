import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ARTA_LABEL, isArtaClass } from "@/lib/arta";
import { fmtDate, fmtDateTime, STATUS_LABEL } from "@/lib/labels";
import { txLabel } from "@/lib/transaction-type";
import { maskedSubject, parseCityRecord } from "@/lib/oversight";
import type { Status } from "@/lib/types";
import { CharterSteps } from "./charter-steps";

/** Read-only view of any record for the CMO and CAO heads: no remarks, no names, no attachments, no actions. */
export async function OversightView({ id, meId }: { id: string; meId: string }) {
  const { t } = await getT();
  const supabase = await createClient();
  const { data } = await supabase.rpc("rms_oversight_record", { p_id: id });
  const r = parseCityRecord(data);
  if (!r) notFound();
  const statusText = (s: string) => t(STATUS_LABEL[s as Status] ?? s);
  const facts: [string, React.ReactNode][] = [
    [t("Received or sent out"), t(r.direction === "incoming" ? "Received by the City" : "Sent out by the City")],
    [t("Document type"), r.document_type],
    [t("Transaction type"), t(txLabel(r.transaction_type))],
    [t("Status"), statusText(r.status)],
    [t("Started by office"), r.origin_office],
    [t("Held by office"), r.current_office],
    ...(r.direction === "incoming"
      ? [[t("Received at"), r.intake_window ? t("{office} window", { office: r.origin_office }) : t("Records Section (City General Services Office)")] as [string, React.ReactNode]]
      : []),
    [t("ARTA processing time"), isArtaClass(r.arta_class) ? t(ARTA_LABEL[r.arta_class]) : "—"],
    [t("Due date"), r.due_date ? fmtDate(r.due_date) : "—"],
    [t("Logged in"), fmtDateTime(r.created_at)],
  ];
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/records?scope=city" className="text-sm text-brand-700 hover:underline">{t("Back to all offices")}</Link>
      <p className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-slate-800">
        {t("You are viewing as City oversight. Only {office} can act on this record.", { office: r.current_office })}
      </p>
      <div>
        <p className="font-mono text-sm text-slate-600">{r.tracking_no}</p>
        <h1 className="text-2xl font-bold break-words">{maskedSubject({ confidential: r.confidential, subject: r.subject, office: r.current_office }, t)}</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {r.service_steps && (
            <CharterSteps recordId={id} steps={r.service_steps} title={r.service_title} totalText={null} canMark={false} meId={meId} nowIso={new Date().toISOString()} readOnly />
          )}
          <section className="card p-4" aria-labelledby="ov-details">
            <h2 id="ov-details" className="mb-3 font-semibold">{t("Details")}</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex gap-2 border-b border-slate-100 py-1">
                  <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
                  <dd className="min-w-0 break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <section className="card p-4 lg:col-span-1" aria-labelledby="ov-history">
          <h2 id="ov-history" className="mb-3 font-semibold">{t("History")}</h2>
          <ol className="space-y-3 text-sm">
            {[...r.history].reverse().map((h, i) => (
              <li key={i}>
                <div className="font-semibold">{statusText(h.status)}{h.from_code || h.to_code ? ` · ${h.from_code ?? "—"} → ${h.to_code ?? "—"}` : ""}</div>
                {h.action_taken && <div className="text-slate-700">{h.action_taken}</div>}
                <div className="text-xs text-slate-500">{fmtDateTime(h.created_at)}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
