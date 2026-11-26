import Link from "next/link";
import { SigninNote } from "@/components/signin-note";
import { canAudit, getProfile, getSettings } from "@/lib/session";
import { IdleLogout } from "@/components/idle-logout";
import { AssistantLauncher } from "@/components/assistant-launcher";
import { ROLE_LABEL } from "@/lib/labels";
import { signOut } from "../login/actions";
import { NavLinks } from "@/components/nav-links";
import { BrandLockup, SiteFooter } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";
import { LogOutIcon } from "@/components/icons";
import { inlineNav } from "@/lib/nav";
import { getT } from "@/lib/i18n/server";
import { AlertBell } from "@/components/alert-bell";
import { assistantContext } from "@/lib/chat-prompts";
import { isAiDemo } from "@/lib/ai-demo";
import { hasFeature, isHrmoCss } from "@/lib/office-features";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, settings, { t }] = await Promise.all([getProfile(), getSettings(), getT()]);
  const links = me.role === "admin"
    ? [
        { href: "/", label: t("Security") },
        { href: "/admin/users", label: t("Users") },
        { href: "/admin/offices", label: t("Offices") },
        { href: "/admin/access", label: t("Access history") },
        { href: "/admin/audit", label: t("Audit log") },
        { href: "/admin/analytics", label: t("Analytics") },
        { href: "/records", label: t("Records") },
        { href: "/admin/bin", label: t("Bin") },
        { href: "/admin/settings", label: t("Settings") },
      ]
    : [
        { href: "/", label: t("Dashboard") },
        { href: "/records", label: t("Records") },
        ...(me.role !== "viewer" ? [{ href: "/records/new", label: t("Register") }] : []),
        ...(canAudit(me) ? [{ href: "/admin/access", label: t("Access history") }, { href: "/admin/audit", label: t("Audit log") }] : []),
        ...(me.role === "records_officer" ? [{ href: "/boxes", label: t("Boxes") }] : []),
        ...(hasFeature(me, "map") ? [{ href: "/map", label: t("Map") }] : []),
        ...(me.role !== "staff" ? [{ href: "/reports", label: t("Reports") }] : []),
        ...(me.role === "staff" && isHrmoCss({ role: me.role, officeCode: me.office?.code, windowFlag: me.window_intake })
          ? [{ href: "/reports/satisfaction", label: t("Client satisfaction") }]
          : []),
      ];
  const ctx = assistantContext(me);
  const roleLabel = ROLE_LABEL[me.role];
  const showRole = !me.full_name.includes(roleLabel);
  const line2 = [showRole ? t(roleLabel) : null, me.office?.name ?? null].filter(Boolean).join(" · ");
  return (
    <div className="app-shell flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t("Skip to main content")}
      </a>
      <header className="shell-header no-print on-dark sticky top-0 z-30 border-b-4 border-gold-500 bg-brand-700 text-white">
        <div className="shell-bar mx-auto flex max-w-7xl items-center gap-x-3 px-4 py-2 xl:py-0">
          <Link prefetch={false} href="/" className="flex min-h-11 items-center rounded-lg">
            <BrandLockup compact />
          </Link>
          <NavLinks part="inline" links={links} inline={inlineNav(links.length)} />
          <div className="ml-auto flex items-center gap-2">
            {me.office_id && me.role !== "admin" && <AlertBell officeCode={me.office?.code ?? null} />}
            <div className="shell-who hidden min-w-0 max-w-[14rem] text-sm leading-tight xl:block xl:text-right" title={line2 ? `${me.full_name} · ${line2}` : me.full_name}>
              <div className="font-semibold [overflow-wrap:anywhere]">{me.full_name}</div>
              <div className="text-xs text-brand-100 [overflow-wrap:anywhere]">{line2}</div>
            </div>
            <AccountMenu />
            <form action={signOut} className="hidden sm:block">
              <button
                aria-label={t("Sign out")}
                title={t("Sign out")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/60 text-white hover:bg-white/10"
              >
                <LogOutIcon />
              </button>
            </form>
          </div>
          <NavLinks
            part="menu"
            links={links}
            inline={inlineNav(links.length)}
            signOutSlot={
              <form action={signOut}>
                <button className="flex min-h-12 w-full items-center gap-3 border-l-4 border-transparent px-3 text-left font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-900">
                  <LogOutIcon className="h-5 w-5" />
                  {t("Sign out")}
                </button>
              </form>
            }
          />
        </div>
        <div className="shell-who-strip bg-brand-800 px-4 py-1.5 text-sm xl:hidden" title={line2 ? `${me.full_name} · ${line2}` : me.full_name}>
          <div className="mx-auto max-w-7xl leading-snug [overflow-wrap:anywhere]">
            <span className="font-semibold">{me.full_name}</span>
            {line2 && <span className="text-brand-100"> · {line2}</span>}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-20 sm:pt-8"><SigninNote />{children}</main>
      <SiteFooter className="mt-12 pb-24" help />
      <AssistantLauncher userId={me.id} greeting={ctx.greeting} scope={ctx.scope} office={ctx.office} prompts={ctx.prompts} demo={isAiDemo()} />
      <IdleLogout minutes={settings.idleTimeoutMinutes} />
    </div>
  );
}
