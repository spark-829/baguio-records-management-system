import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_LABEL, countOn, differsFromRecommended, featuresOff } from "@/lib/office-features";

export const metadata = { title: "Offices" };

/** Admin: which features each office sees. Turning one off only hides it. */
export default async function OfficesPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("rms_offices").select("id, code, name, features").order("name");
  const offices = (data ?? []) as { id: string; code: string; name: string; features: string[] | null }[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Offices")}</h1>
        <p className="max-w-3xl text-slate-700">{t("Choose which features each office sees. Turning a feature off only hides it. Nothing is deleted.")}</p>
      </div>
      <div className="card relative overflow-x-auto" tabIndex={0} role="region" aria-label={t("Offices")}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-4">{t("Office")}</th>
              <th scope="col" className="px-3 whitespace-nowrap">{t("Features on")}</th>
              <th scope="col" className="px-3">{t("Turned off")}</th>
              <th scope="col" className="px-4"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => {
              const c = countOn(o.code, o.features);
              const off = featuresOff(o.code, o.features);
              return (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 text-left align-top font-medium">
                    {o.name}
                    <span className="block font-mono font-normal text-slate-600">{o.code}</span>
                  </th>
                  <td className="px-3 align-top whitespace-nowrap">
                    {t("{n} of {m}", { n: c.on, m: c.of })}
                    {differsFromRecommended(o.code, o.features) && <span className="badge ml-2 bg-slate-100 text-slate-800">{t("Changed")}</span>}
                  </td>
                  <td className="px-3 align-top text-slate-700">{off.length ? off.map((k) => t(FEATURE_LABEL[k])).join(", ") : t("None")}</td>
                  <td className="px-4 text-right align-top">
                    <Link prefetch={false} href={`/admin/offices/${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 items-center font-semibold whitespace-nowrap text-brand-700 underline" aria-label={t("Change features of {office}", { office: o.name })}>{t("Change features")}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
