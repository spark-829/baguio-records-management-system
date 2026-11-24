"use client";

import { forwardRef } from "react";
import { useT } from "@/lib/i18n/client";
import { ARTA_LABEL } from "@/lib/arta";
import { feeShort, splitCatalog, artaFromCharter, type ServiceOpt } from "@/lib/charter";

type Props = {
  value: string;
  onPick: (v: string) => void;
  error: boolean;
  services: ServiceOpt[];
  otherServices: ServiceOpt[];
  counts: Record<string, number>;
  officeName: string;
  central: boolean;
  offices: { id: string; name: string }[];
};

/** "What is this?": the office's Citizen's Charter services as radios, the rest in a select, then "Something else". */
export const ServicePicker = forwardRef<HTMLFieldSetElement, Props>(function ServicePicker(p, ref) {
  const t = useT();
  const { radios, rest } = splitCatalog(p.services, p.counts);
  const restIds = new Set(rest.map((s) => s.id));
  const otherIds = new Set(p.otherServices.map((s) => s.id));
  const byOffice = p.offices
    .map((o) => ({ o, list: p.otherServices.filter((s) => s.office_id === o.id) }))
    .filter((g) => g.list.length > 0);
  return (
    <fieldset
      ref={ref}
      tabIndex={-1}
      id="f-service"
      className="min-w-0 scroll-mt-24 md:col-span-2"
      aria-describedby={`f-service-hint${p.error ? " f-service-error" : ""}`}
      aria-invalid={p.error || undefined}
    >
      <legend className="label">{t("What is this?")}</legend>
      <p id="f-service-hint" className="mb-2 text-sm text-slate-600">
        {t(p.central ? "Pick the Records Section service, or Something else." : "Pick what the client handed in. The kind of document, time limit and due date fill in for you.")}
      </p>
      <div className="grid gap-1">
        {radios.map((s) => (
          <label key={s.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-brand-50">
            <input type="radio" name="svc_pick" value={s.id} checked={p.value === s.id} onChange={() => p.onPick(s.id)} className="mt-1" />
            <span className="min-w-0">
              <span className="block break-words font-semibold">{s.title}</span>
              <span className="block text-[15px] text-slate-600">
                {t(ARTA_LABEL[artaFromCharter(s.classification)])}
                {s.total_text ? ` · ${s.total_text}` : ""} · {t(feeShort(s))}
                {s.confidential && <span className="badge ml-2 bg-slate-100 text-slate-800">{t("Confidential")}</span>}
              </span>
            </span>
          </label>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="mt-2">
          <label className="label" htmlFor="f-service-more">{t("Other services of {office}", { office: p.officeName })}</label>
          <select id="f-service-more" className="input" value={restIds.has(p.value) ? p.value : ""} onChange={(e) => e.target.value && p.onPick(e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {rest.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
      )}
      <p className="my-2 text-sm text-slate-600" aria-hidden>{t("or")}</p>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-brand-50">
        <input type="radio" name="svc_pick" value="other" checked={p.value === "other"} onChange={() => p.onPick("other")} className="mt-1" />
        <span className="font-semibold">{t("Something else (letter, memo, voucher…)")}</span>
      </label>
      {p.central && byOffice.length > 0 && (
        <div className="mt-3">
          <label className="label" htmlFor="f-service-office">{t("Service of the office it goes to (optional)")}</label>
          <p className="mb-2 text-sm text-slate-600">{t("Pick the office's service if the letter asks for one. The office and time limit fill in for you.")}</p>
          <select id="f-service-office" className="input" value={otherIds.has(p.value) ? p.value : ""} onChange={(e) => e.target.value && p.onPick(e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {byOffice.map((g) => (
              <optgroup key={g.o.id} label={g.o.name}>
                {g.list.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {p.error && <p id="f-service-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{t("Choose what this is.")}</p>}
    </fieldset>
  );
});
