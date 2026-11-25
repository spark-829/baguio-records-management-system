import Link from "next/link";

export type TabItem = { key?: string; href: string; label: string; current: boolean };

/** One row of tab links (records saved views, report pages). Scrolls in its own box on phones. */
export function TabNav({ label, items, className = "" }: { label: string; items: TabItem[]; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <nav aria-label={label} className="flex min-w-max gap-1 border-b border-line">
        {items.map((it) => (
          <Link
            key={it.key ?? it.href}
            prefetch={false}
            href={it.href}
            aria-current={it.current ? "page" : undefined}
            className={`focus-inset -mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 no-underline ${it.current ? "border-brand-700 font-semibold text-ink" : "border-transparent text-slate-700 hover:text-ink"}`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
