"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-x-1 text-base">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path === l.href || (path.startsWith(l.href + "/") && l.href !== "/records") || (l.href === "/records" && path.startsWith("/records") && !path.startsWith("/records/new"));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-12 items-center border-b-4 px-3 font-semibold ${active ? "border-brand-700 bg-brand-50 text-brand-900" : "border-transparent text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-900"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
