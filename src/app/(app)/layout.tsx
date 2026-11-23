import Link from "next/link";
import { getProfile, getSettings } from "@/lib/session";
import { IdleLogout } from "@/components/idle-logout";
import { AssistantLauncher } from "@/components/assistant-launcher";
import { ROLE_LABEL } from "@/lib/labels";
import { signOut } from "../login/actions";
import { NavLinks } from "@/components/nav-links";
import { PineMark, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { getT } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, settings, { t }] = await Promise.all([getProfile(), getSettings(), getT()]);
  const links = [
    { href: "/", label: t("Dashboard") },
    { href: "/records", label: t("Records") },
    ...(me.role !== "viewer" ? [{ href: "/records/new", label: t("Register") }] : []),
    { href: "/map", label: t("Map") },
    { href: "/assistant", label: t("Assistant") },
    { href: "/help", label: t("Help") },
    ...(me.role !== "staff" ? [{ href: "/reports", label: t("Reports") }] : []),
    ...(me.role === "admin"
      ? [
          { href: "/admin/users", label: t("Users") },
          { href: "/admin/audit", label: t("Audit log") },
          { href: "/admin/access", label: t("Access history") },
          { href: "/admin/bin", label: t("Bin") },
          { href: "/admin/settings", label: t("Settings") },
        ]
      : []),
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <header className="no-print on-dark border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:py-3">
          <Link href="/" className="flex min-h-11 items-center gap-3 rounded-lg">
            <PineMark />
            <span className="leading-tight">
              <span className="block text-xl font-bold tracking-tight">{t("Baguio RMS")}</span>
              <span className="hidden text-xs text-brand-100 sm:block">{t("Records Management System")}</span>
            </span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-3">
            <LangToggle dark />
            <div className="hidden leading-tight sm:block sm:text-right">
              <div className="font-semibold">{me.full_name}</div>
              <div className="text-xs text-brand-100">
                {t(ROLE_LABEL[me.role])}
                {me.office ? ` · ${me.office.name}` : ""}
              </div>
            </div>
            <Link href="/security" className="hidden min-h-11 items-center sm:inline-flex rounded-lg border-2 border-white/60 px-3.5 font-semibold hover:bg-white/10">{t("My account")}</Link>
            <form action={signOut}>
              <button className="inline-flex min-h-11 items-center rounded-lg border-2 border-white bg-white px-3.5 font-semibold text-brand-800 hover:bg-brand-50">{t("Sign out")}</button>
            </form>
          </div>
        </div>
      </header>
      <div className="no-print border-b border-slate-300 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4">
          <NavLinks links={links} phoneOnly={[{ href: "/security", label: t("My account") }]} />
        </div>
      </div>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter className="mt-10 pb-20" />
      <IdleLogout minutes={settings.idleTimeoutMinutes} />
      <AssistantLauncher />
    </div>
  );
}
