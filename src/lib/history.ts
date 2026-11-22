/** Newest first by an ISO timestamp (histories on screen read newest first). */
export function newestFirst<T>(items: T[], at: (x: T) => string): T[] {
  return [...items].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a)));
}

/** Citizen progress: one line per change of status or office; repeats (notes, double receives) collapse into the first. */
export function collapseSteps<T extends { status: string; office: string }>(steps: T[]): T[] {
  return steps.filter((s, i) => i === 0 || s.status !== steps[i - 1].status || s.office !== steps[i - 1].office);
}
