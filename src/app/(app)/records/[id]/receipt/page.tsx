import { getT } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import { PrintButton } from "../slip/print-button";
import { PrivacyNotice } from "@/components/privacy-notice";
import { DEFAULT_REF_LABEL } from "@/lib/reference-no";

/**
 * Acknowledgment receipt for the person who filed the document: tracking number, tracking code
 * and a QR code that opens the public tracking page. It shows no other personal data.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, lang } = await getT();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select("id, tracking_no, track_code, direction, created_at, sender_name, reference_no, reference_label, doc_type:rms_document_types(name), creator:rms_profiles!rms_records_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  // The receipt shows the filer's name, so opening it goes in the access history like the record page.
  await supabase.rpc("rms_log_access", { p_event: "view_record", p_record_id: data.id, p_detail: { page: "receipt" } });
  const r = data as unknown as {
    tracking_no: string; track_code: string; direction: string; created_at: string; sender_name: string | null; reference_no: string | null; reference_label: string | null;
    doc_type: { name: string } | null; creator: { full_name: string } | null;
  };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${origin}/track?no=${encodeURIComponent(r.tracking_no)}&code=${encodeURIComponent(r.track_code)}`;
  const surveyUrl = `${origin}/survey?no=${encodeURIComponent(r.tracking_no)}&code=${encodeURIComponent(r.track_code)}`;
  const [qr, surveyQr] = await Promise.all([
    QRCode.toString(url, { type: "svg", margin: 0, width: 120 }),
    QRCode.toString(surveyUrl, { type: "svg", margin: 0, width: 120 }),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print mb-4 flex justify-end"><PrintButton label="Print receipt" /></div>
      <div className="border-2 border-dashed border-slate-900 bg-white p-5 text-slate-900">
        <p data-letterhead className="text-center text-xs font-semibold uppercase tracking-widest">{t("Baguio RMS · Demo")}</p>
        <h1 className="text-center text-xl font-bold">{t("Acknowledgment Receipt")}</h1>
        <p className="mt-1 text-center text-sm">{t("Keep this receipt. You need it to follow up your document.")}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-semibold">{t("Tracking no.")}</dt><dd className="font-mono text-lg font-bold">{r.tracking_no}</dd>
          <dt className="font-semibold">{t("Tracking code")}</dt><dd className="font-mono text-lg font-bold tracking-widest">{r.track_code}</dd>
          <dt className="font-semibold">{t("Document")}</dt><dd>{r.doc_type?.name}</dd>
          {r.sender_name && (<><dt className="font-semibold">{t("Filed by")}</dt><dd>{r.sender_name}</dd></>)}
          {r.reference_no && (<><dt className="font-semibold">{t(r.reference_label ?? DEFAULT_REF_LABEL)}</dt><dd className="font-mono">{r.reference_no}</dd></>)}
          <dt className="font-semibold">{t("Received")}</dt><dd>{fmtDateTime(r.created_at, lang)}</dd>
          <dt className="font-semibold">{t("Received by")}</dt><dd>{r.creator?.full_name?.split(" (")[0]}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-300 pt-4">
          <div className="flex shrink-0 gap-4">
            <div>
              <div dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="mt-1 text-center text-xs font-semibold">{t("Track your document")}</p>
            </div>
            <div>
              <div dangerouslySetInnerHTML={{ __html: surveyQr }} />
              <p className="mt-1 text-center text-xs font-semibold">{t("Rate our service")}</p>
            </div>
          </div>
          <p className="min-w-0 text-sm">
            {t("Scan the code, or go to")} <strong className="[overflow-wrap:anywhere]">{origin.replace(/^https?:\/\//, "")}/track</strong> {t("and type the tracking number and code to see where your document is.")}
          </p>
        </div>
        <PrivacyNotice where="receipt" />
      </div>
    </div>
  );
}
