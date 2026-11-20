import Link from "next/link";
import { getProfile, getSettings } from "@/lib/session";
import { IdleLogout } from "@/components/idle-logout";
import { ROLE_LABEL } from "@/lib/labels";
import { signOut } from "../login/actions";
import { NavLinks } from "@/components/nav-links";
import { PineMark, SiteFooter } from "@/components/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/records", label: "Records" },
    ...(me.role !== "viewer" ? [{ href: "/records/new", label: "Register" }] : []),
    { href: "/assistant", label: "Assistant" },
    { href: "/help", label: "Help" },
    ...(me.role !== "staff" ? [{ href: "/reports", label: "Reports" }] : []),
    ...(me.role === "admin"
      ? [
          { href: "/admin/users", label: "Users" },
          { href: "/admin/audit", label: "Audit log" },
          { href: "/admin/access", label: "Access history" },
          { href: "/admin/bin", label: "Bin" },
          { href: "/admin/settings", label: "Settings" },
        ]
      : []),
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-brand-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to main content
      </a>
      <header className="no-print on-dark border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-3 rounded-lg">
            <PineMark />
            <span className="leading-tight">
              <span className="block text-xl font-bold tracking-tight">Baguio RMS</span>
              <span className="block text-xs text-brand-100">Records Management System</span>
            </span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <div className="basis-full leading-tight sm:basis-auto sm:text-right">
              <div className="font-semibold">{me.full_name}</div>
              <div className="text-xs text-brand-100">
                {ROLE_LABEL[me.role]}
                {me.office ? ` · ${me.office.name}` : ""}
              </div>
            </div>
            <Link href="/security" className="inline-flex min-h-11 items-center rounded-lg border-2 border-white/60 px-3.5 font-semibold hover:bg-white/10">My account</Link>
            <form action={signOut}>
              <button className="inline-flex min-h-11 items-center rounded-lg border-2 border-white bg-white px-3.5 font-semibold text-brand-800 hover:bg-brand-50">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="no-print border-b border-slate-300 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4">
          <NavLinks links={links} />
        </div>
      </div>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
      <IdleLogout minutes={settings.idleTimeoutMinutes} />
    </div>
  );
}
