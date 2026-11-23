import { describe, expect, it } from "vitest";
import { citedRecords, splitCitations, stripRecordLinks } from "../src/lib/chat-refs";

const U = "ee895c81-1111-2222-3333-444455556666";

describe("stripRecordLinks", () => {
  it("removes angle-bracket record links", () => {
    expect(stripRecordLinks(`[IN-2026-0524](</records/${U}>) (completed)`)).toBe("IN-2026-0524 (completed)");
  });
  it("removes plain record links", () => {
    expect(stripRecordLinks(`[IN-2026-0524](/records/${U}) (completed)`)).toBe("IN-2026-0524 (completed)");
  });
  it("removes bold around links", () => {
    expect(stripRecordLinks(`**[OUT-2025-0001](/records/${U})**`)).toBe("OUT-2025-0001");
  });
  it("keeps link text for other labels", () => {
    expect(stripRecordLinks(`[the voucher](/records/${U})`)).toBe("the voucher");
  });
  it("leaves other links alone", () => {
    expect(stripRecordLinks("[x](https://a.b)")).toBe("[x](https://a.b)");
  });
  it("removes a parenthesised bare record url as a pair", () => {
    expect(stripRecordLinks(`(see /records/${U}) x`)).toBe("(see) x");
  });
  it("does not backtrack badly on long whitespace", () => {
    const t0 = performance.now();
    stripRecordLinks("[IN-2026-0001](" + " ".repeat(3985));
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it("strips bold", () => {
    expect(stripRecordLinks("**bold** text")).toBe("bold text");
  });
});

describe("citedRecords", () => {
  const recs = [
    { id: "a", tracking_no: "IN-2026-0001" },
    { id: "b", tracking_no: "IN-2026-0524" },
    { id: "c", tracking_no: "OUT-2026-0009" },
  ];
  it("orders by mention and numbers from 1", () => {
    const out = citedRecords("See in-2026-0524 then IN-2026-0001 and IN-2026-0524 again", recs);
    expect(out.map((r) => [r.id, r.n])).toEqual([["b", 1], ["a", 2]]);
  });
  it("does not match a longer number", () => {
    expect(citedRecords("IN-2026-05241 only", recs)).toEqual([]);
  });
  it("dedupes by tracking number", () => {
    const out = citedRecords("IN-2026-0001", [...recs, { id: "a2", tracking_no: "IN-2026-0001" }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });
  it("returns [] for an empty answer", () => {
    expect(citedRecords("", recs)).toEqual([]);
  });
});

describe("splitCitations", () => {
  const num = [{ n: 1, id: "b", tracking_no: "IN-2026-0524" }];
  it("splits text, ref, text and repeats", () => {
    const parts = splitCitations("A in-2026-0524 B IN-2026-0524", num);
    expect(parts).toEqual([
      { text: "A " },
      { ref: 1, tracking_no: "IN-2026-0524", id: "b" },
      { text: " B " },
      { ref: 1, tracking_no: "IN-2026-0524", id: "b" },
    ]);
  });
  it("returns plain text without numbered records", () => {
    expect(splitCitations("hello", [])).toEqual([{ text: "hello" }]);
    expect(splitCitations("", [])).toEqual([]);
  });
});
