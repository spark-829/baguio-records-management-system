import { toneOf } from "./due";

export type NeedsActionRow = { status: string; priority: string; due_date: string | null; created_at: string };
const CLOSED = new Set(["completed", "released", "archived"]);

/** 0 late, 1 due within 7 days (today counts), 2 forwarded (to receive), 3 urgent, 4 the rest. `today` is Manila "YYYY-MM-DD". */
export function needsActionTier(r: NeedsActionRow, today: string): number {
  if (r.due_date && !CLOSED.has(r.status)) {
    const tone = toneOf(r.due_date.slice(0, 10), today);
    if (tone === "late") return 0;
    if (tone === "soon") return 1;
  }
  if (r.status === "forwarded") return 2;
  if (r.priority === "urgent") return 3;
  return 4;
}

/** Dashboard "Waiting in my office" order. Late (oldest due first), due soon (soonest first), forwarded, urgent, rest; newest first otherwise. New array. */
export function sortNeedsAction<T extends NeedsActionRow>(rows: readonly T[], today: string): T[] {
  return rows
    .map((r) => ({ r, tier: needsActionTier(r, today) }))
    .sort((a, b) =>
      a.tier - b.tier ||
      (a.tier <= 1 ? a.r.due_date!.slice(0, 10).localeCompare(b.r.due_date!.slice(0, 10)) : 0) ||
      Date.parse(b.r.created_at) - Date.parse(a.r.created_at))
    .map((x) => x.r);
}
