import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/labels";
import { boxWhere, yearsText } from "@/lib/boxes";
import { StatusBadge } from "@/components/badges";
import type { Status } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  if (!UUID.test(id)) return { title: t("Storage boxes") };
  const supabase = await createClient();
  const { data } = await supabase.from("rms_boxes").select("code").eq("id", id).maybeSingle();
  return { title: t("Box {code}", { code: data?.code ?? "" }).trim() };
}

type Box = {
  id: string; code: string; room: string; shelf: string | null; contents: string | null; notes: string | null;
  year_from: number | null; year_to: number | null; created_at: string;
  office: { code: string; name: string } | null; creator: { full_name: string } | null;
};
type InBox = { id: string; tracking_no: string; subject: string; status: Status; created_at: string };

export default async function BoxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!UUID.test(id)) notFound();
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data: boxRow }, { data: recRows }] = await Promise.all([
    supabase
      .from("rms_boxes")
      .select("*, office:rms_offices!rms_boxes_office_id_fkey(code, name), creator:rms_profiles!rms_boxes_created_by_fkey(full_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("rms_records").select("id, tracking_no, subject, status, created_at").eq("box_id", id).is("deleted_at", null).order("tracking_no").limit(500),
  ]);
  if (!boxRow) notFound();
  const box = boxRow as unknown as Box;
  const recs = (recRows ?? []) as InBox[];
  const desk = me.role === "records_officer";
  const y = yearsText(box.year_from, box.year_to);
  const [titleBefore, titleAfter] = t("Box {code}").split("{code}");
  const rows: [string, React.ReactNode][] = [
    [t("Office"), box.office?.name ?? "—"],
    [t("Room"), box.room],
    [t("Shelf"), box.shelf ?? "—"],
    [t("Years covered"), y ? t(y.key, y.vars) : "—"],
    [t("What is inside"), box.contents ? <span className="whitespace-pre-line">{box.contents}</span> : "—"],
    [t("Notes"), box.notes ? <span className="whitespace-pre-line">{box.notes}</span> : "—"],
    [t("Added by"), t("{date} by {name}", { date: fmtDate(box.created_at), name: box.creator?.full_name ?? "—" })],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{titleBefore}<span className="font-mono whitespace-nowrap">{box.code}</span>{titleAfter}</h1>
          <p className="text-sm text-slate-600">{[boxWhere(box.room, box.shelf), box.office?.name].filter(Boolean).join(" · ")}</p>
        </div>
        {desk && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/boxes/${box.id}/edit`} className="btn-secondary">{t("Change details")}</Link>
            <Link href={`/boxes/${box.id}/label`} className="btn-primary">{t("Print label")}</Link>
          </div>
        )}
      </div>
      {saved === "1" && <p role="status" className="text-sm text-emerald-700">{t("Box saved.")}</p>}
      <section className="card p-4" aria-labelledby="about-h">
        <h2 id="about-h" className="mb-3 font-semibold">{t("About this box")}</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 border-b border-slate-100 py-1">
              <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 break-words font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card p-4" aria-labelledby="in-box-h">
        <h2 id="in-box-h" className="mb-3 font-semibold">{t("Records in this box ({n})", { n: recs.length })}</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-slate-600">{t('No records are in this box yet. To add one, open the record and choose "Put in a box".')}</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {recs.map((r) => (
                <li key={r.id} className="min-h-11 py-2">
                  <Link href={`/records/${r.id}`} className="font-mono font-semibold">{r.tracking_no}</Link>
                  <p className="min-w-0 break-words text-sm">{r.subject}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600"><StatusBadge status={r.status} />{fmtDate(r.created_at)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th scope="col" className="px-3 py-2">{t("Record no.")}</th>
                    <th scope="col" className="px-3 py-2">{t("Subject")}</th>
                    <th scope="col" className="px-3 py-2">{t("Status")}</th>
                    <th scope="col" className="px-3 py-2">{t("Date filed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2"><Link href={`/records/${r.id}`} className="font-mono whitespace-nowrap">{r.tracking_no}</Link></td>
                      <td className="min-w-0 break-words px-3 py-2">{r.subject}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm"><Link href={`/records?box=${encodeURIComponent(box.code)}`}>{t("Open these in Records search")}</Link></p>
          </>
        )}
      </section>
    </div>
  );
}
