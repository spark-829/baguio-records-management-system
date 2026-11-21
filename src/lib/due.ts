export type Tone = "late" | "soon" | "ok";

/** "2026-11-24" as a UTC date, so calendar math never shifts a day. */
export const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** Dot color for a due date: late (passed), soon (today to 7 days ahead) or ok. Both dates are Manila "YYYY-MM-DD". */
export function toneOf(due: string, today: string): Tone {
  if (due < today) return "late";
  const days = Math.round((utc(due).getTime() - utc(today).getTime()) / 864e5);
  return days <= 7 ? "soon" : "ok";
}
