import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { FEATURE_LABEL, type FeatureKey } from "@/lib/office-features";

/** Shown instead of a page whose feature an administrator turned off for the office. Nothing is deleted. */
export async function FeatureOff({ feature }: { feature: FeatureKey }) {
  const { t } = await getT();
  return (
    <div className="card max-w-2xl space-y-3 p-6">
      <h1 className="text-2xl font-bold">{t("{feature} is turned off for your office", { feature: t(FEATURE_LABEL[feature]) })}</h1>
      <p className="text-slate-700">{t("Your administrator can turn it on. Nothing was deleted.")}</p>
      <Link href="/" className="btn-secondary inline-flex">{t("Back to the dashboard")}</Link>
    </div>
  );
}
