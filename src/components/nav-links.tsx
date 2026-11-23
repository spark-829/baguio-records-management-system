"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/records") return path.startsWith("/records") && !path.startsWith("/records/new");
  return path === href || path.startsWith(href + "/");
}

/** Main menu. On wide screens every link shows; on phones it folds into one "Menu" button so pages start near the top. */
type NavLink = { href: string; label: string };

export function NavLinks({ links, phoneOnly = [] }: { links: NavLink[]; phoneOnly?: NavLink[] }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const current = [...links, ...phoneOnly].find((l) => isActive(path, l.href));

  const items = [...links.map((l) => ({ ...l, phone: false })), ...phoneOnly.map((l) => ({ ...l, phone: true }))].map((l) => {
    const active = isActive(path, l.href);
    return (
      <Link
        prefetch={false}
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        className={`${l.phone ? "md:hidden" : "md:inline-flex"} flex min-h-12 items-center border-l-4 px-3 font-semibold md:border-b-4 md:border-l-0 ${active ? "border-brand-700 bg-brand-50 text-brand-900" : "border-transparent text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-900"}`}
      >
        {l.label}
      </Link>
    );
  });

  return (
    <nav aria-label={t("Main menu")} className="text-base">
      <div className="flex items-center justify-between md:hidden">
        <span className="py-3 font-semibold text-brand-900">{current?.label ?? t("Menu")}</span>
        <button
          type="button"
          className="btn-secondary my-1"
          aria-expanded={open}
          aria-controls="main-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t("Close menu") : t("Menu")}
        </button>
      </div>
      <div id="main-menu" className={`${open ? "flex" : "hidden"} flex-col pb-2 md:flex md:flex-row md:flex-wrap md:gap-x-1 md:pb-0`}>
        {items}
      </div>
    </nav>
  );
}
