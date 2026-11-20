"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path === l.href || (path.startsWith(l.href + "/") && l.href !== "/records") || (l.href === "/records" && path.startsWith("/records") && !path.startsWith("/records/new"));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2.5 py-1.5 ${active ? "bg-white/15 font-medium" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
