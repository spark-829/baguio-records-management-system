/** Newest first by an ISO timestamp (used for file and bin events; the record history and public tracking read oldest first). */
export function newestFirst<T>(items: T[], at: (x: T) => string): T[] {
  return [...items].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a)));
}

/** Citizen progress: one line per change of status or office; repeats (notes, double receives) collapse into the first. */
export function collapseSteps<T extends { status: string; office: string }>(steps: T[]): T[] {
  return steps.filter((s, i) => i === 0 || s.status !== steps[i - 1].status || s.office !== steps[i - 1].office);
}

/** Keep the first and last few items and hide the middle when there are more than `max`. */
export function foldMiddle<T>(items: T[], max = 8, head = 2, tail = 4): { head: T[]; hidden: T[]; tail: T[] } {
  if (items.length <= max) return { head: items, hidden: [], tail: [] };
  return { head: items.slice(0, head), hidden: items.slice(head, items.length - tail), tail: items.slice(items.length - tail) };
}
