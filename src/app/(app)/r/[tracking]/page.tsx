import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getProfile, isCentral } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ScanQrButton } from "@/components/scan-qr-button";
import { ConfBadge, StatusBadge } from "@/components/badges";
import { fmtDateTime, partyLabel } from "@/lib/labels";
import { TRACKING_RE } from "@/lib/qr";
import { allowedActions } from "@/lib/workflow";
import type { Confidentiality, Direction, Priority, Status } from "@/lib/types";
import { ReceiveForm } from "./receive-form";

type Rec = {
  id: string;
  tracking_no: string;
  direction: Direction;
  subject: string;
  status: Status;
  priority: Priority;
  confidentiality: Confidentiality;
  due_date: string | null;
  current_office_id: string;
  deleted_at: string | null;
  sender_name: string | null;
  sender_org: string | null;
  recipient_name: string | null;
  recipient_org: string | null;
  current_office: { code: string; name: string } | null;
};

type Step = { created_at: string; action_taken: string | null; actor: { full_name: string } | null; from_office: { name: string } | null };

export default async function ScanReceivePage({ params, searchParams }: { params: Promise<{ tracking: string }>; searchParams: Promise<{ received?: string }> }) {
  const { t, lang } = await getT();
  const { tracking: raw } = await params;
  const { received } = await searchParams;
  let tn = "";
  try {
    tn = decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    tn = "";
  }

  const notAllowed = (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <p className="text-slate-800">{t("We can't open this record. It may not exist, or your account may not open it. Ask the records desk if you think this is wrong.")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/records" className="btn-primary">{t("Go to Records")}</Link>
        <ScanQrButton label="Scan another" />
      </div>
    </div>
  );
  if (!TRACKING_RE.test(tn)) return notAllowed;

  const supabase = await createClient();
  const { data } = await supabase
    .from("rms_records")
    .select(
      "id, tracking_no, direction, subject, status, priority, confidentiality, due_date, current_office_id, deleted_at, sender_name, sender_org, recipient_name, recipient_org, current_office:rms_offices!rms_records_current_office_id_fkey(code, name)",
    )
    .eq("tracking_no", tn)
    .maybeSingle();
  if (!data) return notAllowed;
  const rec = data as unknown as Rec;

  const [me, { data: steps }] = await Promise.all([
    getProfile(),
    supabase
      .from("rms_routes")
      .select("created_at, action_taken, actor:rms_profiles(full_name), from_office:rms_offices!rms_routes_from_office_id_fkey(name)")
      .eq("record_id", rec.id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.rpc("rms_log_access", { p_event: "view_record", p_record_id: rec.id, p_detail: { page: "scan" } }),
  ]);
  const last = ((steps ?? []) as unknown as Step[])[0];
  const actions = rec.deleted_at
    ? []
    : allowedActions({
        status: rec.status,
        direction: rec.direction,
        role: me.role,
        userOfficeId: me.office_id,
        currentOfficeId: rec.current_office_id,
      });
  const office = rec.current_office?.name ?? "";
  const party = rec.direction === "incoming" ? partyLabel(rec.sender_name, rec.sender_org) : partyLabel(rec.recipient_name, rec.recipient_org);

  let info: string;
  if (rec.status === "forwarded") info = t("It is on its way to {office}. Only that office or the records desk can mark it received.", { office });
  else if ((rec.status === "received" || rec.status === "under_action") && me.office_id === rec.current_office_id) info = t("Already received at {office}.", { office });
  else info = t("Now at {office}.", { office });

  const onBehalf = isCentral(me) && me.office_id !== rec.current_office_id;
  const justReceived = received === "1" && (rec.status === "received" || rec.status === "under_action");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="font-mono text-3xl font-bold">{rec.tracking_no}</p>
      <h1 className="text-xl font-semibold">{rec.subject}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={rec.status} />
        <ConfBadge level={rec.confidentiality} />
        <span className="text-sm text-slate-700">{t("Now at {office}", { office })}</span>
      </div>
      <p className="text-sm text-slate-700">{t(rec.direction === "incoming" ? "From" : "To")}: {party}</p>
      {last && (
        <p className="text-sm text-slate-600">
          {t("Last step: {step} by {who} on {when}", {
            step: last.action_taken ?? "",
            who: last.actor?.full_name ?? "—",
            when: fmtDateTime(last.created_at, lang),
          })}
        </p>
      )}
      {actions.includes("receive") ? (
        <ReceiveForm recordId={rec.id} trackingNo={rec.tracking_no} officeName={office} onBehalf={onBehalf} />
      ) : justReceived ? (
        <div role="status" className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <p className="text-lg font-semibold">{t("Received. {tn} is now logged at {office}.", { tn: rec.tracking_no, office })}</p>
          {onBehalf && <p className="text-sm">{t("Recorded by the records desk on behalf of {office}.", { office })}</p>}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-slate-800">{info}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/records/${rec.id}`} className="btn-secondary">{t("Open the full record")}</Link>
        <ScanQrButton label="Scan another" />
      </div>
    </div>
  );
}
