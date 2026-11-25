import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_HINT, FEATURE_LABEL, optionalFeaturesFor, parseFeatures } from "@/lib/office-features";
import { saveOfficeFeatures } from "../actions";

export const metadata = { title: "Office features" };

export default async function OfficeFeaturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!/^[A-Z-]{2,10}$/.test(code)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("rms_offices").select("code, name, features").eq("code", code).maybeSingle();
  if (!data) notFound();
  const on = parseFeatures(data.features ?? []);
  const keys = optionalFeaturesFor(code);
  return (
    <div className="max-w-2xl space-y-4">
      <p><Link href="/admin/offices">{t("← Offices")}</Link></p>
      <h1 className="text-2xl font-bold">{t("Features for {office}", { office: data.name })}</h1>
      {sp.saved === "1" && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
          {t("Saved. Staff of {office} see the change on their next page. Nothing was deleted.", { office: data.name })}
        </p>
      )}
      {sp.error === "1" && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{t("Could not save. Try again.")}</p>}
      <form action={saveOfficeFeatures} className="card space-y-4 p-5">
        <input type="hidden" name="code" value={code} />
        <fieldset className="space-y-1">
          <legend className="mb-2 text-lg font-semibold">{t("Turned on for this office")}</legend>
          {keys.map((k) => (
            <label key={k} className="flex min-h-11 items-start gap-3 py-1">
              <input type="checkbox" name="feature" value={k} defaultChecked={on.includes(k)} className="checkbox mt-1" />
              <span>
                <span className="block font-semibold">{t(FEATURE_LABEL[k])}</span>
                <span className="block text-sm text-slate-600">{t(FEATURE_HINT[k])}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-slate-700">{t("Always on: Register, Records and search, Attachments, History and remarks, Reports for heads, Assistant, Help.")}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">{t("Save features")}</button>
          <button name="recommended" value="1" className="btn-secondary">{t("Use the recommended features")}</button>
        </div>
      </form>
    </div>
  );
}
