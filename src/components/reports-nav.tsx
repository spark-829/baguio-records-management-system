import { TabNav } from "@/components/tab-nav";
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
    <TabNav className="no-print" label={t("Reports")} items={links.map((l) => ({ href: l.href, label: l.label, current: l.href === current }))} />
  );
}
