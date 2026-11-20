import { redirect } from "next/navigation";
import { getProfile, getSettings } from "@/lib/session";
import { saveSettings } from "./actions";

export default async function SettingsPage() {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const s = await getSettings();
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Security settings</h1>
        <p className="text-sm text-slate-600">Changes apply right away and are recorded in the audit log.</p>
      </div>
      <form action={saveSettings} className="card space-y-5 p-4">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">Sign-in</legend>
          <div><label className="label" htmlFor="set-lockout_threshold">Lock after failed tries</label><input id="set-lockout_threshold" type="number" name="lockout_threshold" min={3} max={10} defaultValue={s.lockoutThreshold} className="input" /></div>
          <div><label className="label" htmlFor="set-lockout_minutes">Lock for (minutes)</label><input id="set-lockout_minutes" type="number" name="lockout_minutes" min={5} max={1440} defaultValue={s.lockoutMinutes} className="input" /></div>
          <div><label className="label" htmlFor="set-idle_timeout_minutes">Sign out when idle (minutes)</label><input id="set-idle_timeout_minutes" type="number" name="idle_timeout_minutes" min={5} max={240} defaultValue={s.idleTimeoutMinutes} className="input" /></div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Files and AI</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="watermark_downloads" defaultChecked={s.watermarkDownloads} className="mt-0.5" />
            <span><strong>Stamp downloads</strong> with “Viewed by name, date” (PDF and image files), so a leaked copy can be traced.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="ai_exclude_confidential" defaultChecked={s.aiExcludeConfidential} className="mt-0.5" />
            <span><strong>Keep Confidential records out of AI.</strong> The assistant cannot search or read them and summaries are turned off for them.</span>
          </label>
        </fieldset>
        <button className="btn-primary">Save settings</button>
      </form>
    </div>
  );
}
