import type { SearchFilters } from "./types";
import { filtersToParams } from "./search";

/** Pure helpers for the start screens (records desk, window clerk, office head) and saved views. Labels are English keys; callers wrap them in t(). */
export type DeskRow = {
  status: string;
  direction: string;
  due_date: string | null;
  created_at: string;
  box_id?: string | null;
  current_office: { code: string; name: string } | null;
};

const CLOSED = new Set(["completed", "released", "archived"]);
const manilaDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso));
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export type LateGroup = { code: string; name: string; count: number; since: string };

export function lateByOffice(rows: DeskRow[], today: string): LateGroup[] {
  const map = new Map<string, LateGroup>();
  for (const r of rows) {
    if (CLOSED.has(r.status) || !r.due_date || !r.current_office) continue;
    const due = r.due_date.slice(0, 10);
    if (due >= today) continue;
    const g = map.get(r.current_office.code);
    if (g) {
      g.count += 1;
      if (due < g.since) g.since = due;
    } else {
      map.set(r.current_office.code, { code: r.current_office.code, name: r.current_office.name, count: 1, since: due });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.since.localeCompare(b.since));
}

export function oldestGroup(groups: LateGroup[]): LateGroup | null {
  let best: LateGroup | null = null;
  for (const g of groups) if (!best || g.since < best.since) best = g;
  return best;
}

export function dueAgenda<T extends DeskRow>(rows: T[], today: string): { today: T[]; week: T[] } {
  const end = addDays(today, 7);
  const open = rows.filter((r) => !CLOSED.has(r.status) && r.due_date);
  const sort = (a: T, b: T) => a.due_date!.slice(0, 10).localeCompare(b.due_date!.slice(0, 10)) || b.created_at.localeCompare(a.created_at);
  return {
    today: open.filter((r) => r.due_date!.slice(0, 10) === today).sort(sort),
    week: open.filter((r) => { const d = r.due_date!.slice(0, 10); return d > today && d <= end; }).sort(sort),
  };
}

/** Window clerk: incoming records this window logged today (by me, or at my office), newest first. */
export function windowQueue<T extends DeskRow & { created_by?: string | null; origin_office_id?: string | null }>(
  rows: T[], today: string, meId: string, officeId: string | null,
): T[] {
  return rows
    .filter((r) => r.direction === "incoming" && manilaDay(r.created_at) === today && (r.created_by === meId || (!!officeId && r.origin_office_id === officeId)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Office head: open records in the office that still need the head (not yet received, or nobody assigned). */
export function needsDecision<T extends DeskRow & { assigned_to?: string | null }>(inbox: T[]): T[] {
  return inbox.filter((r) => !CLOSED.has(r.status) && (r.status === "forwarded" || !r.assigned_to));
}

/** Late records held here, oldest due date first. */
export function lateHere<T extends DeskRow>(inbox: T[], today: string): T[] {
  return inbox
    .filter((r) => !CLOSED.has(r.status) && r.due_date && r.due_date.slice(0, 10) < today)
    .sort((a, b) => a.due_date!.slice(0, 10).localeCompare(b.due_date!.slice(0, 10)));
}

/** Next-step hint for the office head's decision list. */
export function headHint(r: { status: string; assigned_to?: string | null }): string | null {
  if (r.status === "forwarded") return "Next: mark as received";
  if (!r.assigned_to) return "Not assigned";
  return null;
}

export function readyToSend<T extends DeskRow>(rows: T[]): T[] {
  return rows.filter((r) => r.direction === "outgoing" && r.status === "completed");
}

export function notInBox<T extends DeskRow>(rows: T[]): T[] {
  return rows.filter((r) => (r.status === "completed" || r.status === "released") && !r.box_id);
}

export function loggedOn(rows: DeskRow[], today: string): number {
  return rows.filter((r) => manilaDay(r.created_at) === today).length;
}

export function countText(n: number, capped: boolean): string {
  return capped ? `${n}+` : String(n);
}

export function nextStepHint(status: string): string | null {
  if (status === "forwarded") return "Next: mark as received";
  if (status === "registered") return "Next: send to an office";
  return null;
}

export type SavedView = {
  key: "all" | "mine" | "late" | "ready" | "sent";
  label: string;
  filters: Partial<SearchFilters>;
  empty: string;
};

/** Records list tabs. Every role gets All, In my office and Late; the records desk also gets the send-out views. */
export function savedViews(officeCode?: string | null, recordsDesk = true): SavedView[] {
  const views: SavedView[] = [{ key: "all", label: "All", filters: {}, empty: "No records match. Try fewer filters." }];
  if (officeCode) {
    views.push({ key: "mine", label: "In my office", filters: { office: officeCode, here: true, open: true }, empty: "Nothing is waiting in your office." });
  }
  views.push({ key: "late", label: "Late", filters: { overdue: true, open: true }, empty: "Nothing is late." });
  if (!recordsDesk) return views;
  views.push(
    { key: "ready", label: "Ready to send out", filters: { direction: "outgoing", status: "completed" }, empty: "Nothing is ready to send out." },
    { key: "sent", label: "Sent out (logbook)", filters: { direction: "outgoing", status: "released" }, empty: "No records match. Try fewer filters." },
  );
  return views;
}

const VIEW_KEYS = ["person", "status", "direction", "office", "docType", "from", "to", "overdue", "here", "open", "priority", "tx", "box", "at"] as const;
const norm = (x: unknown) => (x === false || x === "" || x == null ? undefined : x);

export function activeView(f: SearchFilters, views: SavedView[]): SavedView | null {
  return views.find((v) => VIEW_KEYS.every((k) => norm(f[k]) === norm(v.filters[k]))) ?? null;
}

export function viewHref(f: SearchFilters, v: SavedView): string {
  const qs = filtersToParams({ q: f.q, ...v.filters }).toString();
  return qs ? `/records?${qs}` : "/records";
}
