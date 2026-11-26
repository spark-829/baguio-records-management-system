import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/labels";
import { METHOD_LABEL, type SendMethod } from "@/lib/dispatch";
import { DeliveryForm } from "./paper-forms";

export type Dispatch = {
  method: SendMethod;
  courier: string | null;
  tracking_no: string | null;
  sent_on: string;
  received_by: string | null;
  received_on: string | null;
  delivery_note: string | null;
  sender: { full_name: string } | null;
};

/** How an outgoing record was sent, and whether it was delivered. */
export async function SendingCard({
  recordId, trackingNo, dispatch, canDeliver, justDelivered, today,
}: { recordId: string; trackingNo: string; dispatch: Dispatch; canDeliver: boolean; justDelivered: boolean; today: string }) {
  const { t, lang } = await getT();
  const delivered = Boolean(dispatch.received_by);
  const [before, after] = t("Attach the signed receiving copy under {link}.").split("{link}");
  const rows: [string, React.ReactNode][] = [
    [t("How it was sent"), `${t(METHOD_LABEL[dispatch.method] ?? dispatch.method)}${dispatch.courier ? ` · ${dispatch.courier}` : ""}`],
    [t("Tracking number"), dispatch.tracking_no ? <span className="font-mono text-base">{dispatch.tracking_no}</span> : "—"],
    [t("Date sent"), fmtDate(dispatch.sent_on, lang)],
    [t("Sent by"), dispatch.sender?.full_name ?? "—"],
    [
      t("Delivery"),
      delivered ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="badge bg-emerald-100 text-emerald-900">{t("Delivered")}</span>
          {t("Received by {name} on {date}", { name: dispatch.received_by ?? "", date: fmtDate(dispatch.received_on, lang) })}
        </span>
      ) : (
        <span className="badge bg-blue-100 text-blue-900">{t("Waiting for delivery")}</span>
      ),
    ],
    ...(dispatch.delivery_note ? [[t("Note"), dispatch.delivery_note] as [string, React.ReactNode]] : []),
  ];
  return (
    <section id="sending" className="card p-4" aria-labelledby="sending-h">
      <h2 id="sending-h" className="mb-3 font-semibold">{t("Sending")}</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 border-b border-slate-100 py-1">
            <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {justDelivered && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {t("Delivery saved.")} {before}
          <Link href="#attachments" className="font-semibold underline underline-offset-4">{t("Attachments")}</Link>
          {after}
        </p>
      )}
      {canDeliver && <DeliveryForm recordId={recordId} trackingNo={trackingNo} sentOn={dispatch.sent_on} today={today} />}
    </section>
  );
}
