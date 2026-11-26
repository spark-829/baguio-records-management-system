"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { isActive } from "@/lib/nav";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { useExclusivePanel } from "@/components/use-exclusive-panel";

type NavLink = { href: string; label: string };

type Props = { links: NavLink[]; inline: boolean; signOutSlot?: React.ReactNode };

/**
 * Main menu, used twice as a direct child of the header bar so the Menu button comes last in the tab order.
 * - part="inline": the links sit in the header from xl up (the shell CSS hides them while the assistant panel is docked).
 * - part="menu": the Menu button and its sheet, below xl, or at every width when there are too many links to fit inline (see `inlineNav`).
 */
export function NavLinks({ part, ...props }: Props & { part: "inline" | "menu" }) {
  return part === "inline" ? <InlineLinks {...props} /> : <MenuSheet {...props} />;
}

function InlineLinks({ links, inline }: Props) {
  const path = usePathname();
  const t = useT();
  if (!inline) return null;
  return (
    <nav aria-label={t("Main menu")} className="shell-nav-inline hidden items-stretch gap-1 self-stretch xl:flex">
      {links.map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link
            prefetch={false}
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-4 px-3 text-base text-white hover:bg-white/10 ${active ? "border-gold-300 font-bold" : "border-transparent font-semibold"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MenuSheet({ links, inline, signOutSlot }: Props) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => setOpen(false), [path]);
  useExclusivePanel("menu", open, close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (button.current?.contains(target) || sheet.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="main-menu"
        aria-label={open ? t("Close menu") : t("Menu")}
        title={open ? t("Close menu") : t("Menu")}
        onClick={() => setOpen((o) => !o)}
        className={`shell-menu h-11 w-11 items-center justify-center rounded-lg border-2 border-white/60 hover:bg-white/10 ${inline ? "inline-flex xl:hidden" : "inline-flex"}`}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <div
          ref={sheet}
          id="main-menu"
          className={`shell-sheet absolute inset-x-0 top-full z-50 border-b border-slate-300 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain bg-white text-base text-slate-900 shadow-lg ${inline ? "xl:hidden" : ""}`}
        >
          <nav aria-label={t("Main menu")} className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {links.map((l) => {
              const active = isActive(path, l.href);
              return (
                <Link
                  prefetch={false}
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center border-l-4 px-3 ${active ? "border-brand-700 bg-brand-50 font-bold text-brand-900" : "border-transparent font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-900"}`}
                >
                  {l.label}
                </Link>
              );
            })}
            {signOutSlot && <div className="mt-1 border-t border-slate-200 pt-1 sm:hidden">{signOutSlot}</div>}
          </nav>
        </div>
      )}
    </>
  );
}
