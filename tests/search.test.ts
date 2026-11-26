import { describe, expect, it } from "vitest";
import { cleanParam, filtersFromParams, filtersToParams, searchRecordsPage } from "../src/lib/search";

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

describe("box filter", () => {
  it("reads a box code, upper-cased, and drops junk", () => {
    expect(filtersFromParams({ box: "cgso 2026 012" }).box).toBe("CGSO-2026-012");
    expect(filtersFromParams({ box: "x'; drop" }).box).toBeUndefined();
    expect(filtersFromParams({}).box).toBeUndefined();
  });
  it("round-trips", () => {
    const f = filtersFromParams({ box: "CGSO-2026-012" });
    expect(filtersToParams(f).get("box")).toBe("CGSO-2026-012");
    expect(filtersFromParams(Object.fromEntries(filtersToParams(f))).box).toBe("CGSO-2026-012");
  });
});

describe("received-at filter", () => {
  it("round-trips window and desk, drops anything else", () => {
    expect(filtersFromParams({ at: "window" }).at).toBe("window");
    expect(filtersFromParams({ at: "desk" }).at).toBe("desk");
    expect(filtersFromParams({ at: "x'; drop" }).at).toBeUndefined();
    expect(filtersFromParams({}).at).toBeUndefined();
    expect(filtersToParams({ at: "window" }).get("at")).toBe("window");
    expect(filtersToParams({}).has("at")).toBe(false);
  });
});

describe("filtersFromParams input cleaning (QA-092)", () => {
  it("drops control characters, bad dates and unknown statuses", () => {
    const f = filtersFromParams({ q: "abc\u0000def", from: "2026-13-45", to: "nope", status: "bogus", direction: "sideways" });
    expect(f.q).toBe("abc def");
    expect(f.from).toBeUndefined();
    expect(f.to).toBeUndefined();
    expect(f.status).toBeUndefined();
    expect(f.direction).toBeUndefined();
  });
  it("keeps good values and caps long text", () => {
    const f = filtersFromParams({ q: "x".repeat(500), from: "2026-11-01", status: "received", direction: "incoming" });
    expect(f.q).toHaveLength(200);
    expect(f.from).toBe("2026-11-01");
    expect(f.status).toBe("received");
    expect(f.direction).toBe("incoming");
    expect(cleanParam("\u0000")).toBeUndefined();
  });
});
