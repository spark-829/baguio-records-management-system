import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { isCentral, type getProfile } from "@/lib/session";
import { hasFeature } from "@/lib/office-features";

type Me = Awaited<ReturnType<typeof getProfile>>;

/** Links between the report pages, shown at the top of each one (service navigation pattern). */
export async function ReportsNav({ me, current }: { me: Me; current: string }) {
  if (me.role === "staff") return null; // staff only reach the satisfaction page, nothing to switch to
  const { t } = await getT();
  const links = [
    { href: "/reports", label: t("Summary"), show: true },
    { href: "/reports/offices", label: t("Office workload"), show: me.role !== "viewer" },
    { href: "/reports/satisfaction", label: t("Client satisfaction"), show: (isCentral(me) || me.role === "dept_head") && hasFeature(me, "satisfaction") },
    { href: "/reports/retention", label: t("Retention schedule"), show: isCentral(me) },
    { href: "/reports/released", label: t("Released documents logbook"), show: (me.role === "records_officer" || me.role === "dept_head") && hasFeature(me, "logbook") },
    { href: "/reports/step-times", label: t("Standard time per step"), show: me.role === "records_officer" },
  ].filter((l) => l.show);
  return (
    <nav aria-label={t("Reports")} className="no-print border-b border-line">
      <ul className="flex flex-wrap gap-x-1">
        {links.map((l) => {
          const active = l.href === current;
          return (
            <li key={l.href}>
              <Link
                prefetch={false}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-4 px-3 no-underline ${active ? "border-brand-700 font-bold text-brand-900" : "border-transparent font-semibold text-brand-700 hover:border-slate-400"}`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
