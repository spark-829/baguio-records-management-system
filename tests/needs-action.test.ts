import { describe, expect, it } from "vitest";
import { needsActionTier, sortNeedsAction } from "../src/lib/needs-action";

const today = "2026-11-24";
const row = (o: Partial<{ id: string; status: string; priority: string; due_date: string | null; created_at: string }> = {}) => ({
  id: "x", status: "received", priority: "normal", due_date: null as string | null, created_at: "2026-11-01T00:00:00Z", ...o,
});

describe("needsActionTier", () => {
  it("ranks tiers", () => {
    expect(needsActionTier(row({ due_date: "2026-11-20" }), today)).toBe(0);
    expect(needsActionTier(row({ due_date: "2026-11-24" }), today)).toBe(1);
    expect(needsActionTier(row({ due_date: "2026-12-01" }), today)).toBe(1);
    expect(needsActionTier(row({ due_date: "2026-12-02", status: "forwarded" }), today)).toBe(2);
    expect(needsActionTier(row({ priority: "urgent" }), today)).toBe(3);
    expect(needsActionTier(row(), today)).toBe(4);
  });
  it("ignores due dates on closed records", () => {
    expect(needsActionTier(row({ due_date: "2026-11-01", status: "completed" }), today)).toBe(4);
    expect(needsActionTier(row({ due_date: "2026-11-01", status: "archived" }), today)).toBe(4);
  });
  it("handles a time part", () => {
    expect(needsActionTier(row({ due_date: "2026-11-20T08:00:00Z" }), today)).toBe(0);
  });
});

describe("sortNeedsAction", () => {
  it("orders late oldest due first, then soon soonest first", () => {
    const out = sortNeedsAction([
      row({ id: "s2", due_date: "2026-11-30" }), row({ id: "l2", due_date: "2026-11-22" }),
      row({ id: "s1", due_date: "2026-11-25" }), row({ id: "l1", due_date: "2026-11-10" }),
    ], today);
    expect(out.map((r) => r.id)).toEqual(["l1", "l2", "s1", "s2"]);
  });
  it("forwarded before urgent before normal", () => {
    const out = sortNeedsAction([row({ id: "n" }), row({ id: "u", priority: "urgent" }), row({ id: "f", status: "forwarded" })], today);
    expect(out.map((r) => r.id)).toEqual(["f", "u", "n"]);
  });
  it("newest first within a tier", () => {
    const out = sortNeedsAction([row({ id: "old", created_at: "2026-10-01T00:00:00Z" }), row({ id: "new", created_at: "2026-11-10T00:00:00Z" })], today);
    expect(out.map((r) => r.id)).toEqual(["new", "old"]);
  });
  it("does not mutate input", () => {
    const input = [row({ id: "a" }), row({ id: "b", priority: "urgent" })];
    const copy = [...input];
    sortNeedsAction(input, today);
    expect(input).toEqual(copy);
  });
});
