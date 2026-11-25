import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { listSize } from "@/lib/list-size";
import { boxWhere, yearsText } from "@/lib/boxes";

export const metadata = { title: "Storage boxes" };

type BoxRow = {
  id: string; code: string; office_code: string; office_name: string; room: string; shelf: string | null;
  year_from: number | null; year_to: number | null; contents: string | null; records: number; total: number;
};

/** Records desk: every storage box, with where it is and how many records it holds. */
export default async function BoxesPage({ searchParams }: { searchParams: Promise<{ q?: string; n?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "records_officer") redirect("/");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const n = listSize(sp.n, 50, 500);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_box_list", { p_q: q || null, p_limit: n });
  const rows = (data ?? []) as BoxRow[];
  const total = rows[0]?.total ?? 0;
  const years = (r: BoxRow) => {
    const y = yearsText(r.year_from, r.year_to);
    return y ? t(y.key, y.vars) : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("Storage boxes")}</h1>
        <Link href="/boxes/new" className="btn-primary">{t("Add a box")}</Link>
      </div>
      <Form action="/boxes" prefetch={false} className="card p-4">
        <label className="label" htmlFor="q">{t("Find a box")}</label>
        <div className="flex flex-wrap gap-2">
          <input id="q" name="q" className="input min-w-0 flex-1 basis-60" defaultValue={q} autoComplete="off" aria-describedby="q-hint" />
          <button className="btn-secondary">{t("Search")}</button>
          {q && <Link href="/boxes" className="btn-secondary">{t("Clear search")}</Link>}
        </div>
        <p id="q-hint" className="mt-1 text-sm text-slate-600">{t("Box code, office, room or what is inside")}</p>
      </Form>
      {error && <p role="alert" className="text-sm text-red-700">{t("Something went wrong. Please try again.")}</p>}
      {rows.length === 0 && !error ? (
        <div className="card space-y-3 p-5">
          {q ? (
            <>
              <p>{t('No boxes match "{q}".', { q })}</p>
              <Link href="/boxes" className="btn-secondary">{t("Clear search")}</Link>
            </>
          ) : (
            <>
              <p>{t("No boxes yet. Add the first box to start tracking where paper records are kept.")}</p>
              <Link href="/boxes/new" className="btn-primary">{t("Add a box")}</Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">{t(total === 1 ? "{n} box" : "{n} boxes", { n: total })}</p>
          <ul className="divide-y divide-slate-200 card lg:hidden">
            {rows.map((r) => (
              <li key={r.id} className="min-h-11 px-4 py-2">
                <Link href={`/boxes/${r.id}`} className="font-mono font-bold whitespace-nowrap">{r.code}</Link>
                <p className="text-sm text-slate-600">
                  {[boxWhere(r.room, r.shelf), r.office_code, years(r), t("{n} records", { n: r.records })].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th scope="col" className="px-3 py-2">{t("Box code")}</th>
                  <th scope="col" className="px-3 py-2">{t("Office")}</th>
                  <th scope="col" className="px-3 py-2">{t("Where it is")}</th>
                  <th scope="col" className="px-3 py-2">{t("Years")}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t("Records")}</th>
                  <th scope="col" className="px-3 py-2">{t("What is inside")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2"><Link href={`/boxes/${r.id}`} className="font-mono whitespace-nowrap">{r.code}</Link></td>
                    <td className="px-3 py-2">{r.office_name}</td>
                    <td className="px-3 py-2">{boxWhere(r.room, r.shelf)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{years(r) || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.records}</td>
                    <td className="max-w-xs truncate px-3 py-2" title={r.contents ?? undefined}>{r.contents ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length >= n && n < 500 && (
            <p>
              <Link href={`/boxes?${new URLSearchParams({ ...(q ? { q } : {}), n: String(n + 50) })}`} className="btn-secondary">{t("Show {n} more", { n: 50 })}</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
