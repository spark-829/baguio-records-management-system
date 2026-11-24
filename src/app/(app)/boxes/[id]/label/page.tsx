import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { boxUrl } from "@/lib/qr";
import { yearsText } from "@/lib/boxes";
import { PrintButton } from "../../../records/[id]/slip/print-button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  if (!UUID.test(id)) return { title: t("Storage boxes") };
  const supabase = await createClient();
  const { data } = await supabase.from("rms_boxes").select("code").eq("id", id).maybeSingle();
  return { title: t("Box label {code}", { code: data?.code ?? "" }).trim() };
}

/** A6 label to stick on the box: code, where it is, what is inside, and a QR that opens the box page. */
export default async function BoxLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_boxes")
    .select("id, code, room, shelf, contents, year_from, year_to, office:rms_offices!rms_boxes_office_id_fkey(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const box = data as unknown as {
    id: string; code: string; room: string; shelf: string | null; contents: string | null;
    year_from: number | null; year_to: number | null; office: { name: string } | null;
  };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const qr = await QRCode.toString(boxUrl(origin, box.id), { type: "svg", margin: 0, width: 151 });
  const y = yearsText(box.year_from, box.year_to);

  return (
    <div className="mx-auto max-w-md">
      <style>{"@media print{@page{size:105mm 148mm;margin:6mm}}"}</style>
      <div className="no-print mb-4 flex justify-between gap-2">
        <Link href={`/boxes/${box.id}`} className="btn-secondary">{t("Back to box")}</Link>
        <PrintButton label="Print label" />
      </div>
      <div className="space-y-2 border-2 border-black bg-white p-4 text-black">
        <h1 className="whitespace-nowrap font-mono text-[30pt] font-bold leading-none">{box.code}</h1>
        <p className="text-sm font-semibold">{box.office?.name}</p>
        {y && <p className="text-sm">{t("Years:")} {t(y.key, y.vars)}</p>}
        <p className="text-sm">{[box.room, box.shelf].filter(Boolean).join(" · ")}</p>
        {box.contents && (
          <div className="text-sm">
            <p className="font-semibold">{t("Contents:")}</p>
            <p className="whitespace-pre-line line-clamp-3">{box.contents}</p>
          </div>
        )}
        <div className="pt-2 text-center">
          <div className="mx-auto [&>svg]:h-full [&>svg]:w-full" style={{ width: "40mm", height: "40mm" }} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-1 text-xs">{t("Scan to open this box (staff sign-in needed)")}</p>
        </div>
      </div>
    </div>
  );
}
