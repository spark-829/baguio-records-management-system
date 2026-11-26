import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getProfile, getSettings } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";

export default async function SettingsPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const s = await getSettings();
  // Hidden when the database update for the AI budget has not been run yet
  const { data: spend } = await (await createClient()).rpc("rms_ai_spend_summary");
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Security settings")}</h1>
        <p className="text-sm text-slate-600">{t("Changes apply right away and are recorded in the audit log.")}</p>
      </div>
      {spend && (
        <section className="card space-y-1 p-4">
          <h2 className="font-semibold">{t("AI spend: ${spent} of ${cap}", { spent: Number(spend.spent).toFixed(4), cap: Number(spend.cap).toFixed(2) })}</h2>
          <p className="text-sm text-slate-600">{t("{n} AI calls so far. When the budget is used up, AI features switch to the practice version.", { n: Number(spend.calls ?? 0) })}</p>
        </section>
      )}
      <form action={saveSettings} className="card space-y-5 p-4">
        <fieldset className="grid items-end gap-3 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">{t("Sign-in")}</legend>
          <div><label className="label" htmlFor="set-lockout_threshold">{t("Lock after failed tries")}</label><input id="set-lockout_threshold" type="number" name="lockout_threshold" min={3} max={10} defaultValue={s.lockoutThreshold} className="input" /></div>
          <div><label className="label" htmlFor="set-lockout_minutes">{t("Lock for (minutes)")}</label><input id="set-lockout_minutes" type="number" name="lockout_minutes" min={5} max={1440} defaultValue={s.lockoutMinutes} className="input" /></div>
          <div><label className="label" htmlFor="set-idle_timeout_minutes">{t("Sign out when idle (minutes)")}</label><input id="set-idle_timeout_minutes" type="number" name="idle_timeout_minutes" min={5} max={240} defaultValue={s.idleTimeoutMinutes} className="input" /></div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">{t("Files and AI")}</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="watermark_downloads" defaultChecked={s.watermarkDownloads} className="mt-0.5" />
            <span><strong>{t("Stamp downloads")}</strong> {t("with “Viewed by name, date” (PDF and image files), so a leaked copy can be traced.")}</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked disabled aria-describedby="ai-conf-note" className="mt-0.5" />
            <span><strong>{t("Keep Confidential records out of AI.")}</strong> {t("The assistant cannot search or read them and summaries are turned off for them.")} <span id="ai-conf-note" className="text-slate-600">{t("Always on: the AI service is outside the Philippines, so this can no longer be switched off.")}</span></span>
          </label>
        </fieldset>
        <button className="btn-primary">{t("Save settings")}</button>
      </form>
    </div>
  );
}
