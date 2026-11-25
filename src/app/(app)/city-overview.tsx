import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { maskedSubject, parseOverview } from "@/lib/oversight";
import type { Status } from "@/lib/types";

const CITY_LATE_SHOWN = 10;

/** "My office | All offices" switch for the CMO and CAO heads. Links wrap on a narrow screen. */
export async function ScopeLinks({ base, scope }: { base: string; scope: "city" | "mine" }) {
  const { t } = await getT();
  const cls = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold no-underline ${on ? "border-brand-800 bg-brand-800 text-white" : "border-line bg-white text-brand-800 hover:bg-brand-50"}`;
  return (
    <nav aria-label={t("View")} className="no-print flex flex-wrap gap-2">
      <Link prefetch={false} href={base} className={cls(scope === "mine")} aria-current={scope === "mine" ? "page" : undefined}>{t("My office")}</Link>
      <Link prefetch={false} href={`${base}?scope=city`} className={cls(scope === "city")} aria-current={scope === "city" ? "page" : undefined}>{t("All offices")}</Link>
    </nav>
  );
}

/** Read-only city-wide numbers from one aggregated database call. */
export async function CityOverview() {
  const { t } = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_oversight_overview");
  if (error) throw new Error("City overview failed");
  const o = parseOverview(data);
  const cards = [
    { label: t("Open records"), value: o.totals.open, alert: false },
    { label: t("Late"), value: o.totals.late, alert: o.totals.late > 0 },
    { label: t("Due within 3 days"), value: o.totals.due_soon, alert: false },
    { label: t("Waiting to be received"), value: o.totals.waiting, alert: false },
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">{t("All offices, read-only. Confidential subjects are hidden.")}</p>
      <section aria-label={t("Summary")} className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white px-4 py-3 sm:px-5 sm:py-4">
            <div className={`text-3xl font-bold tabular-nums ${c.alert ? "text-red-700" : "text-ink"}`}>{c.value}</div>
            <div className="text-sm text-slate-700">{c.label}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="city-offices" className="space-y-2">
        <h2 id="city-offices" className="text-xl font-bold">{t("By office")}</h2>
        <p className="text-sm text-slate-600">{t("Most late records first.")}</p>
        <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={t("By office")}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-3">{t("Office")}</th>
                <th scope="col" className="p-3">{t("Open")}</th>
                <th scope="col" className="p-3">{t("Late")}</th>
                <th scope="col" className="p-3">{t("Waiting to be received")}</th>
              </tr>
            </thead>
            <tbody>
              {[...o.offices].sort((a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name)).map((f) => (
                <tr key={f.code} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 font-medium">
                    <Link prefetch={false} href={`/records?scope=city&office=${encodeURIComponent(f.code)}`} className="inline-flex min-h-11 items-center py-2 text-brand-700 hover:underline">{f.name}</Link>
                  </th>
                  <td className="p-3 tabular-nums">{f.open}</td>
                  <td className={`p-3 tabular-nums ${f.late > 0 ? "font-semibold text-red-700" : ""}`}>{f.late}</td>
                  <td className="p-3 tabular-nums">{f.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="city-late" className="space-y-2">
        <h2 id="city-late" className="text-xl font-bold">{t("Late records")}</h2>
        {o.late.length === 0 ? (
          <p className="card p-5">{t("Nothing is late.")}</p>
        ) : (
          <ul className="card divide-y divide-line">
            {o.late.slice(0, CITY_LATE_SHOWN).map((r) => (
              <li key={r.id} className="grid gap-1 px-4 py-3 sm:px-5">
                <span className="font-semibold">{maskedSubject(r, t)}</span>
                <span className="text-sm text-slate-600">
                  <Link prefetch={false} href={`/records/${r.id}?scope=city`} className="inline-flex min-h-11 items-center font-mono text-brand-700 hover:underline">{r.tracking_no}</Link>
                  {" · "}{r.office}
                  {" · "}{t(STATUS_LABEL[r.status as Status] ?? r.status)}
                  {r.due_date ? <> · <span className="font-semibold text-red-700">{t("Due {date}", { date: fmtDate(r.due_date) })}</span></> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {o.late.length > CITY_LATE_SHOWN && (
          <p className="text-sm text-slate-600">
            {t("Showing the {n} oldest.", { n: CITY_LATE_SHOWN })}{" "}
            <Link prefetch={false} href="/records?scope=city&late=1" className="font-semibold text-brand-700">{t("See all late records")}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
