import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile, getSettings } from "@/lib/session";
import { STEP_KEYS, STEP_LABEL } from "@/lib/step-times";
import { saveStepTimes } from "./actions";

export const metadata = { title: "Standard time per step" };

const NO_STANDARD = ["Add a note", "Mark as done", "Mark as sent out", "File away (archive)"];

/** Records desk only: the standard minutes per step. The record history flags steps that took longer ("Slow"). */
export default async function StepTimesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "records_officer") redirect("/reports");
  const { saved, error } = await searchParams;
  const { stepMinutes } = await getSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/reports" className="text-sm text-brand-700 hover:underline">{t("Back to reports")}</Link>
      <div>
        <h1 className="text-2xl font-bold">{t("Standard time per step")}</h1>
        <p className="text-sm text-slate-600">{t("From the Citizen's Charter, GSO Service 15 (24 minutes).")}</p>
        <p className="text-sm text-slate-600">{t("Office hours only (Monday to Friday, 8 AM to 5 PM, holidays skipped).")}</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{t("Type minutes from 1 to 600.")}</p>}
      {saved && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{t("Standard times saved.")}</p>}
      <form action={saveStepTimes} className="card space-y-3 p-4">
        {STEP_KEYS.map((k) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0" htmlFor={`st-${k}`}>{t(STEP_LABEL[k])}</label>
            <span className="flex items-center gap-2">
              <input id={`st-${k}`} name={k} type="number" min={1} max={600} inputMode="numeric" defaultValue={stepMinutes[k] ?? ""} className="input w-24" />
              <span className="text-sm text-slate-600">{t("minutes")}</span>
            </span>
          </div>
        ))}
        <ul className="space-y-1 border-t border-line pt-3 text-sm text-slate-700">
          {NO_STANDARD.map((s) => (
            <li key={s} className="flex justify-between gap-2"><span>{t(s)}</span><span className="text-slate-600">{t("No standard")}</span></li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">{t("Save standard times")}</button>
          <button className="btn-secondary" name="preset" value="charter" formNoValidate>{t("Use the Citizen's Charter times")}</button>
        </div>
      </form>
    </div>
  );
}
