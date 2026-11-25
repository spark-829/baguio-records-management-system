import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countOn, differsFromRecommended } from "@/lib/office-features";

export const metadata = { title: "Offices" };

/** Admin: which features each office sees. Turning one off only hides it. */
export default async function OfficesPage() {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("rms_offices").select("id, code, name, features").order("code");
  const offices = (data ?? []) as { id: string; code: string; name: string; features: string[] | null }[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Offices")}</h1>
        <p className="max-w-3xl text-slate-700">{t("Choose which features each office sees. Turning a feature off only hides it. Nothing is deleted.")}</p>
      </div>
      <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={t("Offices")}>
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="p-3">{t("Office")}</th>
              <th scope="col" className="p-3">{t("Code")}</th>
              <th scope="col" className="p-3">{t("Features on")}</th>
              <th scope="col" className="p-3"><span className="sr-only">{t("Changes")}</span></th>
              <th scope="col" className="p-3"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => {
              const c = countOn(o.code, o.features);
              return (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 font-medium">{o.name}</th>
                  <td className="p-3 font-mono">{o.code}</td>
                  <td className="p-3">{t("{n} of {m}", { n: c.on, m: c.of })}</td>
                  <td className="p-3">
                    {differsFromRecommended(o.code, o.features) && <span className="badge bg-slate-100 text-slate-800">{t("Changed")}</span>}
                  </td>
                  <td className="p-3">
                    <Link prefetch={false} href={`/admin/offices/${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline" aria-label={t("Change features of {office}", { office: o.name })}>{t("Change features")}</Link>
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
