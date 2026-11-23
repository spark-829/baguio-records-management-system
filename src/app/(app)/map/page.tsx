import { BarangayMap, type MapRecord } from "@/components/barangay-map";
import { getT } from "@/lib/i18n/server";
import { fetchPages } from "@/lib/fetch-pages";
import { createClient } from "@/lib/supabase/server";
import { tallyBarangays } from "@/lib/map-tally";
import { isOverdue } from "@/lib/workflow";
import type { Status } from "@/lib/types";

export const metadata = { title: "Barangay map" };

const DONE: Status[] = ["completed", "released", "archived"];

/** Where documents come from or go to, by barangay. Only records the account may see are counted. */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ show?: string; b?: string }> }) {
  const [{ t }, { show, b }] = await Promise.all([getT(), searchParams]);
  const onlyOpen = show === "open";
  const picked = typeof b === "string" && b.trim() && b.length <= 100 ? b : null;
  const supabase = await createClient();
  type MapRow = { status: Status; due_date: string | null; barangay: string };
  // PostgREST caps one response at 1000 rows, so read in pages
  const { data, error } = await fetchPages<MapRow>((from, to) =>
    supabase
      .from("rms_records")
      .select("barangay, status, due_date")
      .is("deleted_at", null)
      .not("barangay", "is", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: MapRow[] | null; error: unknown }>,
  );
  const rows = data;
  const tally = tallyBarangays(
    rows
      .filter((r) => !onlyOpen || !DONE.includes(r.status))
      .map((r) => ({ barangay: r.barangay, late: isOverdue(r.due_date, r.status as Status) })),
  );
  let list: MapRecord[] = [];
  if (picked && !error) {
    type PickRow = { id: string; tracking_no: string; subject: string; status: Status; due_date: string | null };
    let q = supabase
      .from("rms_records")
      .select("id, tracking_no, subject, status, due_date")
      .is("deleted_at", null)
      .eq("barangay", picked);
    if (onlyOpen) q = q.not("status", "in", `(${DONE.join(",")})`);
    const { data: picks } = await q.order("created_at", { ascending: false }).limit(100);
    list = ((picks ?? []) as PickRow[]).map((r) => ({
      id: r.id,
      tracking_no: r.tracking_no,
      subject: r.subject,
      barangay: picked,
      late: isOverdue(r.due_date, r.status),
      open: !DONE.includes(r.status),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Barangay map")}</h1>
          <p className="max-w-3xl text-slate-700">
            {t("How many documents are addressed to or are about each barangay. Only records your account may see are counted.")}
          </p>
        </div>
        <nav aria-label={t("Which records to count")} className="inline-flex rounded-lg border-2 border-brand-700 p-0.5">
          {[
            ["all", "All records"],
            ["open", "Still being handled"],
          ].map(([k, label]) => {
            const on = (k === "open") === onlyOpen;
            return (
              <a
                key={k}
                href={k === "open" ? "/map?show=open" : "/map"}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold no-underline ${on ? "bg-brand-700 text-white" : "text-brand-800 hover:bg-brand-50"}`}
              >
                {t(label)}
              </a>
            );
          })}
        </nav>
      </div>
      {error ? (
        <p className="rounded-lg border border-l-4 border-amber-300 border-l-amber-700 bg-amber-50 px-4 py-3 text-amber-950">
          {t("The map turns on after the database update for barangays is run.")}
        </p>
      ) : (
        <BarangayMap tally={tally} picked={picked} pickedList={list} onlyOpen={onlyOpen} />
      )}
    </div>
  );
}
