import { getT } from "@/lib/i18n/server";
import Link from "next/link";

/** Shown inside the normal header and menu, so people can carry on from where they are. */
export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <h1 className="text-2xl font-bold">{t("Page not found")}</h1>
      <p className="mt-2 text-slate-700">{t("This page or record does not exist, or your account is not allowed to see it.")}</p>
      <p className="mt-1 text-slate-700">{t("Check the tracking number, or search for it on the Records page.")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/records" className="btn-primary">{t("Go to Records")}</Link>
        <Link href="/" className="btn-secondary">{t("Back to dashboard")}</Link>
      </div>
    </div>
  );
}
