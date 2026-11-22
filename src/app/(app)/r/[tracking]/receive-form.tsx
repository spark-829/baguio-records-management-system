"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { ScanQrButton } from "@/components/scan-qr-button";
import { recordAction } from "../../records/[id]/actions";

export function ReceiveForm({ recordId, trackingNo, officeName, onBehalf }: { recordId: string; trackingNo: string; officeName: string; onBehalf: boolean }) {
  const t = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState(recordAction, undefined);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        <p className="text-lg font-semibold">{t("Received. {tn} is now logged at {office}.", { tn: trackingNo, office: officeName })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/records/${recordId}`} className="btn-secondary">{t("Open the full record")}</Link>
          <ScanQrButton label="Scan another" />
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="kind" value="receive" />
      <input type="hidden" name="action_taken" value="Received (QR scan)" />
      <div>
        <label htmlFor="remarks" className="label">{t("Where is the paper now, or a note (optional)")}</label>
        <textarea id="remarks" name="remarks" maxLength={300} rows={2} className="input" placeholder={t("e.g. Front desk, tray 2")} />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{t("Not saved:")} {t(state.error)}</p>}
      <button className="btn-primary min-h-16 w-full text-xl" disabled={pending}>
        {t("Received at {office}", { office: officeName })}
      </button>
      {onBehalf && <p className="text-sm text-slate-600">{t("(records desk, on behalf of that office)")}</p>}
    </form>
  );
}
