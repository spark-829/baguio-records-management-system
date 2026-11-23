import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { FINISHED, retention, type RetentionState } from "@/lib/retention";
import type { Status } from "@/lib/types";
import { PrintButton } from "../../records/[id]/slip/print-button";

export const metadata = { title: "Retention schedule" };

type Row = {
  id: string;
  tracking_no: string;
  subject: string;
  status: Status;
  doc_type: { name: string; retention_years: number } | null;
  current_office: { name: string } | null;
  routes: { status: Status; created_at: string }[];
};

const STATE: Record<RetentionState, { label: string; tone: string }> = {
  review_now: { label: "Keep period over: review for disposal", tone: "bg-red-50 text-red-900 border-red-300" },
  review_soon: { label: "Review within 90 days", tone: "bg-amber-50 text-amber-950 border-amber-300" },
  keep: { label: "Keep", tone: "bg-emerald-50 text-emerald-900 border-emerald-300" },
};

/**
 * Retention schedule: how long each finished record must be kept, by document type,
 * counted from the day it was finished. Nothing is ever deleted from here; it only tells the records desk what to review.
 */
export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin" && me.role !== "records_officer") redirect("/reports");
  const { show } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: types }] = await Promise.all([
    supabase
      .from("rms_records")
      .select("id, tracking_no, subject, status, doc_type:rms_document_types(name, retention_years), current_office:rms_offices!rms_records_current_office_id_fkey(name), routes:rms_routes(status, created_at)")
      .is("deleted_at", null)
      .in("status", FINISHED)
      .order("created_at")
      .limit(5000),
    supabase.from("rms_document_types").select("name, retention_years").eq("is_active", true).order("retention_years", { ascending: false }),
  ]);

  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const finishedAt =
      r.routes.filter((x) => FINISHED.includes(x.status)).map((x) => x.created_at).sort()[0] ?? r.routes.map((x) => x.created_at).sort().at(-1)!;
    const years = r.doc_type?.retention_years ?? 5;
    return { ...r, finishedAt, years, ...retention(finishedAt, years) };
  });
  rows.sort((a, b) => (a.keepUntil ?? "9999").localeCompare(b.keepUntil ?? "9999"));
  const counts = { review_now: 0, review_soon: 0, keep: 0 } as Record<RetentionState, number>;
  rows.forEach((r) => counts[r.state]++);
  const shown = show && show in STATE ? rows.filter((r) => r.state === show) : rows;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <p><Link href="/reports">{t("← Reports")}</Link></p>
          <h1 className="text-2xl font-bold">{t("Retention schedule")}</h1>
          <p className="max-w-3xl text-slate-700">
            {t("How long each finished record must be kept, by kind of document, counted from the day it was finished. This page never deletes anything. It only lists what the records desk should review with the Records Officer and the disposal authority.")}
          </p>
        </div>
        <PrintButton label="Print schedule" />
      </div>
      <h1 className="hidden text-xl font-bold print:block">{t("Retention schedule, printed {date}", { date: fmtDate(new Date().toISOString()) })}</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(STATE) as RetentionState[]).map((k) => (
          <Link key={k} href={show === k ? "/reports/retention" : `/reports/retention?show=${k}`} className={`card block border-l-4 p-4 no-underline ${STATE[k].tone} ${show === k ? "ring-2 ring-brand-700" : ""}`}>
            <div className="font-semibold">{t(STATE[k].label)}</div>
            <div className="text-3xl font-bold tabular-nums">{counts[k]}</div>
            <div className="text-sm underline">{t(show === k ? "Show all" : "Show only these")}</div>
          </Link>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th className="px-4 py-2">{t("Tracking no.")}</th>
              <th className="px-4 py-2">{t("Subject")}</th>
              <th className="px-4 py-2">{t("Kind")}</th>
              <th className="px-4 py-2">{t("Finished")}</th>
              <th className="px-4 py-2">{t("Keep until")}</th>
              <th className="px-4 py-2">{t("What to do")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-sm"><Link href={`/records/${r.id}`}>{r.tracking_no}</Link></td>
                <td className="px-4 py-2">{r.subject}<div className="text-sm text-slate-600">{STATUS_LABEL[r.status]} · {r.current_office?.name}</div></td>
                <td className="px-4 py-2 text-slate-700">{r.doc_type?.name}<div className="text-sm text-slate-600">{r.permanent ? t("Permanent") : r.years === 0 ? t("No keep period") : t("{n} years", { n: r.years })}</div></td>
                <td className="whitespace-nowrap px-4 py-2">{fmtDate(r.finishedAt)}</td>
                <td className="whitespace-nowrap px-4 py-2 font-semibold">{r.keepUntil ? fmtDate(r.keepUntil) : t("Permanent")}</td>
                <td className="px-4 py-2"><span className={`badge border ${STATE[r.state].tone}`}>{t(r.permanent ? "Keep permanently" : STATE[r.state].label)}</span></td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">{t("No finished records in this group.")}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">{t("Keep periods by kind of document")}</h2>
        <p className="text-slate-700">{t("Set by the administrator. Based on the City's records disposition schedule.")}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {(types ?? []).map((ty) => (
            <li key={ty.name} className="flex justify-between border-b border-slate-100 py-1">
              <span>{ty.name}</span>
              <span className="font-semibold">{ty.retention_years >= 50 ? t("Permanent (50 years or more)") : t("{n} years", { n: ty.retention_years })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
