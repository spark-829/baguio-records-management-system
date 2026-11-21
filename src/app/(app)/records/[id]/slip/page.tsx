import { getT } from "@/lib/i18n/server";
import { actionText } from "@/lib/i18n/core";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { CONF_LABEL, PRIORITY_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import { PrintButton } from "./print-button";

const shortStamp = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(iso));

export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("rms_records")
    .select("id, tracking_no, direction, subject, priority, confidentiality, sender_name, sender_org, recipient_name, recipient_org, document_date, due_date, created_at, doc_type:rms_document_types(name), origin:rms_offices!rms_records_origin_office_id_fkey(code, name), creator:rms_profiles!rms_records_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!rec) notFound();
  // Steps already done are printed on the slip, so the paper matches the system.
  const { data: steps } = await supabase
    .from("rms_routes")
    .select("created_at, action_taken, remarks, from_office:rms_offices!rms_routes_from_office_id_fkey(code), to_office:rms_offices!rms_routes_to_office_id_fkey(code)")
    .eq("record_id", id)
    .order("created_at");
  const done = (steps ?? []) as unknown as { created_at: string; action_taken: string | null; remarks: string | null; from_office: { code: string } | null; to_office: { code: string } | null }[];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const qr = await QRCode.toString(`${origin}/records/${rec.id}`, { type: "svg", margin: 0, width: 132 });
  const r = rec as unknown as {
    tracking_no: string; direction: string; subject: string; priority: "low" | "normal" | "urgent"; confidentiality: "public" | "internal" | "confidential";
    sender_name: string | null; sender_org: string | null; recipient_name: string | null; recipient_org: string | null;
    document_date: string | null; due_date: string | null; created_at: string;
    doc_type: { name: string } | null; origin: { code: string; name: string } | null; creator: { full_name: string } | null;
  };
  const party = r.direction === "incoming" ? [r.sender_name, r.sender_org] : [r.recipient_name, r.recipient_org];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-between gap-2">
        <Link href={`/records/${id}`} className="btn-secondary">{t("Back to record")}</Link>
        <PrintButton />
      </div>
      <div className="border-2 border-slate-900 bg-white p-6 text-slate-900">
        <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest">{t("City Government of Baguio · Demo")}</p>
            <h1 className="text-xl font-bold">{t("Document Routing Slip")}</h1>
            <p className="mt-2 font-mono text-2xl font-bold">{r.tracking_no}</p>
            <p className="text-sm">{t(r.direction === "incoming" ? "Incoming" : "Outgoing")} · {r.doc_type?.name} · {t(PRIORITY_LABEL[r.priority])} · {t(CONF_LABEL[r.confidentiality])}</p>
          </div>
          <div className="shrink-0 text-center">
            <div dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-1 text-[10px]">{t("Scan to open the record")}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-y-1 py-3 text-sm">
          <dt className="font-semibold">{t("Subject")}</dt><dd className="col-span-2">{r.subject}</dd>
          <dt className="font-semibold">{t(r.direction === "incoming" ? "From" : "To")}</dt><dd className="col-span-2">{party.filter(Boolean).join(", ") || "—"}</dd>
          <dt className="font-semibold">{t("Date on document")}</dt><dd className="col-span-2">{fmtDate(r.document_date)}</dd>
          <dt className="font-semibold">{t("Registered")}</dt><dd className="col-span-2">{fmtDateTime(r.created_at)} · {r.origin?.name} · {r.creator?.full_name}</dd>
          <dt className="font-semibold">{t("Action due")}</dt><dd className="col-span-2">{fmtDate(r.due_date)}</dd>
        </dl>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr>
              {[["Date / time", "w-[16%]"], ["From", "w-[13%]"], ["To", "w-[13%]"], ["Action taken / remarks", ""], ["Signature", "w-[17%]"]].map(([h, w]) => (
                <th key={h} className={`border border-slate-900 px-2 py-1 text-left ${w}`}>{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {done.map((d, i) => (
              <tr key={`d${i}`} className="align-top text-xs leading-snug">
                <td className="border border-slate-900 px-1 whitespace-nowrap">{shortStamp(d.created_at)}</td>
                <td className="border border-slate-900 px-1">{d.from_office?.code}</td>
                <td className="border border-slate-900 px-1">{d.to_office?.code}</td>
                <td className="border border-slate-900 px-1">{[actionText(d.action_taken, t), d.remarks].filter(Boolean).join(" · ")}</td>
                <td className="border border-slate-900 px-1 text-slate-500">{t("(in system)")}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(3, 9 - done.length) }).map((_, i) => (
              <tr key={i} className="h-9">
                {Array.from({ length: 5 }).map((__, j) => <td key={j} className="border border-slate-900" />)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
