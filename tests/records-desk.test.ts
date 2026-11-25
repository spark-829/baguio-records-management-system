import { describe, expect, it } from "vitest";
import {
  activeView, countText, dueAgenda, lateByOffice, loggedOn, nextStepHint, notInBox, oldestGroup, readyToSend, savedViews, viewHref,
  type DeskRow,
} from "../src/lib/records-desk";

const T = "2026-11-25";
const off = (code: string) => ({ code, name: `${code} office` });
const row = (o: Partial<DeskRow>): DeskRow => ({
  status: "received", direction: "incoming", due_date: null, created_at: "2026-11-01T00:00:00Z", box_id: null, current_office: off("A"), ...o,
});

describe("lateByOffice", () => {
  it("groups open late rows by office", () => {
    const g = lateByOffice([
      row({ due_date: "2026-11-20T00:00:00+08:00" }),
      row({ due_date: "2026-11-10" }),
      row({ due_date: "2026-11-01", current_office: off("B") }),
      row({ due_date: "2026-11-02", current_office: off("B") }),
      row({ due_date: "2026-11-03", current_office: off("C") }),
      row({ due_date: "2026-11-01", status: "completed" }),
      row({ due_date: "2026-11-01", current_office: null }),
      row({ due_date: T }),
    ], T);
    expect(g.map((x) => [x.code, x.count, x.since])).toEqual([["B", 2, "2026-11-01"], ["A", 2, "2026-11-10"], ["C", 1, "2026-11-03"]].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[2]).localeCompare(String(b[2]))));
    expect(g[0].code).toBe("B");
    expect(g[1].code).toBe("A");
  });
  it("oldestGroup", () => {
    expect(oldestGroup([])).toBeNull();
    expect(oldestGroup([{ code: "A", name: "A", count: 3, since: "2026-11-10" }, { code: "B", name: "B", count: 1, since: "2026-11-02" }])?.code).toBe("B");
  });
});

describe("dueAgenda", () => {
  it("splits today and the next 7 days", () => {
    const rows = [
      row({ due_date: "2026-11-26" }), row({ due_date: "2026-12-02" }), row({ due_date: "2026-12-03" }),
      row({ due_date: T }), row({ due_date: "2026-11-27" }), row({ due_date: "2026-11-26", status: "released" }),
    ];
    const a = dueAgenda(rows, T);
    expect(a.today).toHaveLength(1);
    expect(a.week.map((r) => r.due_date)).toEqual(["2026-11-26", "2026-11-27", "2026-12-02"]);
  });
});

describe("buckets", () => {
  it("readyToSend", () => {
    const r = readyToSend([row({ direction: "outgoing", status: "completed" }), row({ status: "completed" }), row({ direction: "outgoing", status: "released" })]);
    expect(r).toHaveLength(1);
  });
  it("notInBox", () => {
    const r = notInBox([row({ status: "completed" }), row({ status: "released", box_id: undefined }), row({ status: "completed", box_id: "b" }), row({ status: "received" })]);
    expect(r).toHaveLength(2);
  });
  it("loggedOn uses Manila days", () => {
    expect(loggedOn([row({ created_at: "2026-11-24T16:30:00Z" }), row({ created_at: "2026-11-24T15:59:00Z" })], T)).toBe(1);
  });
  it("countText", () => {
    expect(countText(5, false)).toBe("5");
    expect(countText(500, true)).toBe("500+");
  });
  it("nextStepHint", () => {
    expect(nextStepHint("forwarded")).toBe("Next: mark as received");
    expect(nextStepHint("registered")).toBe("Next: send to an office");
    expect(nextStepHint("received")).toBeNull();
  });
});

describe("saved views", () => {
  const views = savedViews("CGSO");
  it("lists views in order", () => {
    expect(savedViews(null).some((v) => v.key === "mine")).toBe(false);
    expect(views.map((v) => v.key)).toEqual(["all", "mine", "late", "ready", "sent"]);
  });
  it("activeView", () => {
    expect(activeView({}, views)?.key).toBe("all");
    expect(activeView({ q: "x" }, views)?.key).toBe("all");
    expect(activeView({ overdue: true, open: true }, views)?.key).toBe("late");
    expect(activeView({ overdue: true, open: true, tx: "G2C" }, views)).toBeNull();
    expect(activeView({ office: "CGSO", here: true, open: true }, views)?.key).toBe("mine");
    expect(activeView({ direction: "outgoing", status: "completed", priority: "urgent" }, views)).toBeNull();
    expect(activeView({ overdue: false }, views)?.key).toBe("all");
  });
  it("viewHref", () => {
    const by = (k: string) => views.find((v) => v.key === k)!;
    expect(viewHref({}, by("all"))).toBe("/records");
    expect(viewHref({ q: "deed" }, by("late"))).toBe("/records?q=deed&overdue=1&open=1");
    expect(viewHref({}, by("mine"))).toBe("/records?office=CGSO&here=1&open=1");
  });
});
