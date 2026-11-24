import Link from "next/link";
import { getProfile, getSettings } from "@/lib/session";
import { IdleLogout } from "@/components/idle-logout";
import { AssistantLauncher } from "@/components/assistant-launcher";
import { ROLE_LABEL } from "@/lib/labels";
import { signOut } from "../login/actions";
import { NavLinks } from "@/components/nav-links";
import { BrandLockup, SiteFooter } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { getT } from "@/lib/i18n/server";
import { AlertBell } from "@/components/alert-bell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, settings, { t }] = await Promise.all([getProfile(), getSettings(), getT()]);
  const links = me.role === "admin"
    ? [
        { href: "/", label: t("Security") },
        { href: "/admin/users", label: t("Users") },
        { href: "/admin/access", label: t("Access history") },
        { href: "/admin/audit", label: t("Audit log") },
        { href: "/admin/analytics", label: t("Analytics") },
        { href: "/records", label: t("Records") },
        { href: "/admin/bin", label: t("Bin") },
        { href: "/admin/settings", label: t("Settings") },
        { href: "/help", label: t("Help") },
      ]
    : [
        { href: "/", label: t("Dashboard") },
        { href: "/records", label: t("Records") },
        ...(me.role !== "viewer" ? [{ href: "/records/new", label: t("Register") }] : []),
        { href: "/map", label: t("Map") },
        { href: "/assistant", label: t("Assistant") },
        { href: "/help", label: t("Help") },
        ...(me.role !== "staff" ? [{ href: "/reports", label: t("Reports") }] : []),
      ];
  const roleLabel = ROLE_LABEL[me.role];
  const showRole = !me.full_name.includes(roleLabel);
  const line2 = [showRole ? t(roleLabel) : null, me.office?.name ?? null].filter(Boolean).join(" · ");
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <header className="no-print on-dark border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:py-3">
          <Link prefetch={false} href="/" className="flex min-h-11 items-center rounded-lg">
            <BrandLockup />
          </Link>
          <div className="relative ml-auto flex min-w-0 flex-wrap items-center justify-end lg:flex-nowrap gap-2 text-sm sm:gap-3">
            <LangToggle dark />
            {me.office_id && me.role !== "admin" && <AlertBell officeCode={me.office?.code ?? null} />}
            <div className="hidden min-w-0 max-w-[12rem] leading-tight sm:block sm:text-right xl:max-w-[18rem]" title={line2 ? `${me.full_name} · ${line2}` : me.full_name}>
              <div className="truncate font-semibold">{me.full_name}</div>
              <div className="truncate text-xs text-brand-100">{line2}</div>
            </div>
            <Link prefetch={false} href="/security" className="hidden min-h-11 items-center sm:inline-flex rounded-md border-2 border-white/60 px-3.5 font-semibold hover:bg-white/10">{t("My account")}</Link>
            <form action={signOut}>
              <button className="inline-flex min-h-11 items-center rounded-md border-2 border-white/60 px-3.5 font-semibold text-white hover:bg-white/10">{t("Sign out")}</button>
            </form>
          </div>
        </div>
      </header>
      <div className="no-print border-b border-slate-300 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-start gap-2 px-4">
          <div className="min-w-0 flex-1">
            <NavLinks links={links} phoneOnly={[{ href: "/security", label: t("My account") }]} />
          </div>
          <AssistantLauncher userId={me.id} />
        </div>
      </div>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <SiteFooter className="mt-12" />
      <IdleLogout minutes={settings.idleTimeoutMinutes} />
    </div>
  );
}
