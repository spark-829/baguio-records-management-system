import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchFilters, SearchRow } from "./types";
import { isTxType, type TxType } from "./transaction-type";
import { isBoxCode, normalizeBoxCode } from "./boxes";

const MANILA = "Asia/Manila";
const manilaDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: MANILA }).format(new Date(iso));
const shiftDay = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

/**
 * Staff often type only the number ("37", "0037", "2026-0037"). Turn that into full tracking numbers
 * for incoming and outgoing records, or return null when the text is a normal search.
 */
export function trackingGuesses(q: string | undefined, year = new Date().getFullYear()): string[] | null {
  const t = (q ?? "").trim().toUpperCase();
  let m = t.match(/^(\d{4})-(\d{1,4})$/);
  if (m) return ["IN", "OUT"].map((d) => `${d}-${m![1]}-${m![2].padStart(4, "0")}`);
  m = t.match(/^#?(\d{1,4})$/);
  if (m) return ["IN", "OUT"].map((d) => `${d}-${year}-${m![1].padStart(4, "0")}`);
  return null;
}

async function rpc(supabase: SupabaseClient, f: SearchFilters, limit: number, excludeConfidential: boolean) {
  const { data, error } = await supabase.rpc("rms_search_records_v5", {
    p_q: f.q || null,
    p_person: f.person || null,
    p_direction: f.direction || null,
    p_status: f.status || null,
    p_office_code: f.office || null,
    p_doc_type: f.docType || null,
    // The database compares whole UTC days. Ask one day wider and trim to Manila dates below.
    p_from: f.from ? shiftDay(f.from, -1) : null,
    p_to: f.to || null,
    p_overdue: f.overdue ?? false,
    p_limit: limit,
    p_exclude_confidential: excludeConfidential,
    p_tx: f.tx || null,
    p_box_code: f.box || null,
    p_intake: f.at || null,
    p_open: Boolean(f.open),
    p_here: Boolean(f.here && f.office),
    p_priority: f.priority || null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchRow[];
}

/** Runs the records search as the calling user (row-level security applies inside the database). */
export async function searchRecordsPage(supabase: SupabaseClient, f: SearchFilters, limit = 50, excludeConfidential = false) {
  const guesses = trackingGuesses(f.q);
  let rows = guesses
    ? (await Promise.all(guesses.map((q) => rpc(supabase, { ...f, q }, limit, excludeConfidential)))).flat()
    : await rpc(supabase, f, limit, excludeConfidential);
  if (guesses) {
    const exact = [...new Map(rows.filter((r) => guesses.includes(r.tracking_no)).map((r) => [r.id, r])).values()];
    rows = exact.length ? exact : await rpc(supabase, f, limit, excludeConfidential);
  }
  // Several topic words and nothing has all of them: show records with any of them (best matches first).
  const words = (f.q ?? "").trim().split(/\s+/).filter(Boolean);
  if (!guesses && rows.length === 0 && words.length > 1 && !/\b(or|OR)\b|"/.test(f.q!)) {
    rows = await rpc(supabase, { ...f, q: words.join(" or ") }, limit, excludeConfidential);
  }
  // More may exist in the database when it returned a full page, even if the filters below drop rows
  const more = rows.length >= limit;
  const kept = rows.filter((r) => {
    const day = manilaDay(r.created_at);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.open && ["completed", "released", "archived"].includes(r.status)) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.here && f.office && r.current_office.toUpperCase() !== f.office.toUpperCase()) return false;
    return true;
  });
  return { rows: kept, more };
}

export async function searchRecords(supabase: SupabaseClient, f: SearchFilters, limit = 50, excludeConfidential = false) {
  return (await searchRecordsPage(supabase, f, limit, excludeConfidential)).rows;
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
    here: one("here") === "1",
    open: one("open") === "1",
    tx: isTxType(one("tx")) ? (one("tx") as TxType) : undefined,
    box: (() => {
      const b = normalizeBoxCode(one("box"));
      return isBoxCode(b) ? b : undefined;
    })(),
    at: (["window", "desk"].includes(one("at") ?? "") ? one("at") : undefined) as SearchFilters["at"],
    priority: (["low", "normal", "urgent"].includes(one("priority") ?? "") ? one("priority") : undefined) as SearchFilters["priority"],
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
  if (f.here) p.set("here", "1");
  if (f.open) p.set("open", "1");
  if (f.priority) p.set("priority", f.priority);
  if (f.tx) p.set("tx", f.tx);
  if (f.box) p.set("box", f.box);
  if (f.at) p.set("at", f.at);
  return p;
}
