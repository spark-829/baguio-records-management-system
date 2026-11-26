import Link from "next/link";

export type StatItem = { label: string; value: number | string; href?: string; alert?: boolean; hint?: string };

/** One row of summary numbers: label above, big number below. A label is a link only when `href` is given. */
export function StatStrip({ items, label }: { items: StatItem[]; label: string }) {
  const n = items.length;
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line ${n === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
      {items.map((s, i) => {
        const span = n === 3 && i === 2 ? "col-span-2 md:col-span-1" : "";
        const value = <span className={`block text-3xl font-bold tabular-nums ${s.alert ? "text-red-700" : "text-brand-900"}`}>{s.value}</span>;
        return s.href ? (
          <Link prefetch={false} key={s.label} href={s.href} className={`focus-inset block bg-white px-4 py-3 no-underline hover:bg-brand-50 sm:px-5 sm:py-4 ${span}`}>
            <span className="text-sm font-semibold text-brand-700 underline underline-offset-4">{s.label}</span>
            {value}
            {s.hint && <span className="mt-1 block text-xs text-slate-600">{s.hint}</span>}
          </Link>
        ) : (
          <div key={s.label} className={`bg-white px-4 py-3 sm:px-5 sm:py-4 ${span}`}>
            <span className="block text-sm font-semibold text-slate-600">{s.label}</span>
            {value}
            {s.hint && <span className="mt-1 block text-xs text-slate-600">{s.hint}</span>}
          </div>
        );
      })}
    </section>
  );
}
