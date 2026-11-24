import { describe, expect, it } from "vitest";
import { filtersFromParams, filtersToParams, searchRecordsPage } from "../src/lib/search";

describe("searchRecordsPage", () => {
  it("reports more when the database page was full but filters dropped every row", async () => {
    const limit = 3;
    const data = Array.from({ length: limit }, (_, i) => ({
      id: `r${i}`, tracking_no: `IN-2026-000${i}`, status: "completed", priority: "normal",
      created_at: "2026-01-05T00:00:00Z", current_office: "CEO",
    }));
    const supabase = { rpc: async () => ({ data, error: null }) } as never;
    const out = await searchRecordsPage(supabase, { open: true }, limit);
    expect(out.rows.length).toBe(0);
    expect(out.more).toBe(true);
  });
});

describe("tx filter", () => {
  it("reads a valid tx and drops an invalid one", () => {
    expect(filtersFromParams({ tx: "G2G" }).tx).toBe("G2G");
    expect(filtersFromParams({ tx: "zzz" }).tx).toBeUndefined();
  });
  it("round-trips", () => {
    const f = filtersFromParams({ tx: "G2B" });
    expect(filtersFromParams(Object.fromEntries(filtersToParams(f))).tx).toBe("G2B");
  });
});
