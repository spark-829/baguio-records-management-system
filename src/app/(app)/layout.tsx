import Link from "next/link";
import { getProfile, getSettings } from "@/lib/session";
import { IdleLogout } from "@/components/idle-logout";
import { ROLE_LABEL } from "@/lib/labels";
import { signOut } from "../login/actions";
import { NavLinks } from "@/components/nav-links";

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
    <div className="min-h-screen">
      <header className="no-print bg-brand-800 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Baguio <span className="text-brand-100">RMS</span>
          </Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{me.full_name}</div>
              <div className="text-xs text-brand-100">
                {ROLE_LABEL[me.role]}
                {me.office ? ` · ${me.office.name}` : ""}
              </div>
            </div>
            <Link href="/security" className="rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10">My account</Link>
            <form action={signOut}>
              <button className="rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <IdleLogout minutes={settings.idleTimeoutMinutes} />
    </div>
  );
}
