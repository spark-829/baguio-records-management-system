import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchFilters, SearchRow } from "./types";

/** Runs the records search as the calling user (row-level security applies inside the database). */
export async function searchRecords(supabase: SupabaseClient, f: SearchFilters, limit = 50, excludeConfidential = false) {
  const { data, error } = await supabase.rpc("rms_search_records", {
    p_q: f.q || null,
    p_person: f.person || null,
    p_direction: f.direction || null,
    p_status: f.status || null,
    p_office_code: f.office || null,
    p_doc_type: f.docType || null,
    p_from: f.from || null,
    p_to: f.to || null,
    p_overdue: f.overdue ?? false,
    p_limit: limit,
    p_exclude_confidential: excludeConfidential,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchRow[];
}

export function filtersFromParams(sp: Record<string, string | string[] | undefined>): SearchFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  return {
    q: one("q"),
    person: one("person"),
    direction: one("direction") as SearchFilters["direction"],
    status: one("status") as SearchFilters["status"],
    office: one("office"),
    docType: one("type"),
    from: one("from"),
    to: one("to"),
    overdue: one("overdue") === "1",
  };
}

export function filtersToParams(f: SearchFilters) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.person) p.set("person", f.person);
  if (f.direction) p.set("direction", f.direction);
  if (f.status) p.set("status", f.status);
  if (f.office) p.set("office", f.office);
  if (f.docType) p.set("type", f.docType);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.overdue) p.set("overdue", "1");
  return p;
}
