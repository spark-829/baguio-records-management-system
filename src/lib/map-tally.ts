export type BarangayTally = Record<string, { n: number; late: number }>;

/** Count records (and late ones) per barangay; rows with no barangay are skipped. */
export function tallyBarangays(rows: { barangay: string; late: boolean }[]): BarangayTally {
  const out: BarangayTally = {};
  for (const r of rows) {
    if (!r.barangay) continue;
    const e = (out[r.barangay] ??= { n: 0, late: 0 });
    e.n++;
    if (r.late) e.late++;
  }
  return out;
}
