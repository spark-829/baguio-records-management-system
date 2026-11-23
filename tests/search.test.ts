import { describe, expect, it } from "vitest";
import { searchRecordsPage } from "../src/lib/search";

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
