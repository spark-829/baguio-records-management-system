import { describe, expect, it } from "vitest";
import {
  artaFromCharter, canMarkStep, canUndoStep, charterSlowByRoute, feeShort, parseSteps, prefillFromService, primaryTx,
  splitCatalog, stepsView, topServices, type ServiceOpt, type ServiceStep,
} from "../src/lib/charter";

const svc = (o: Partial<ServiceOpt> = {}): ServiceOpt => ({
  id: "s1", office_id: "o1", title: "Service", classification: "simple", tx_types: ["G2C", "G2B"], fee_text: null,
  fee_php: null, total_text: "20 minutes", total_minutes: 20, confidential: false, doc_type_name: "Request", sort_order: 1, ...o,
});

describe("small helpers", () => {
  it("artaFromCharter and primaryTx", () => {
    expect(artaFromCharter("highly_technical")).toBe("highly_technical");
    expect(artaFromCharter("weird")).toBe("none");
    expect(primaryTx(svc())).toBe("G2C");
  });
  it("feeShort", () => {
    expect(feeShort({ fee_php: null, fee_text: "None" })).toBe("No fee");
    expect(feeShort({ fee_php: 0, fee_text: "x" })).toBe("No fee");
    expect(feeShort({ fee_php: 150, fee_text: "Php 150" })).toBe("₱150");
    expect(feeShort({ fee_php: null, fee_text: "Per ordinance" })).toBe("Fee per ordinance");
  });
});

describe("splitCatalog", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => svc({ id: `s${i + 1}`, sort_order: i + 1 }));
  it("up to 8 are all radios", () => {
    const r = splitCatalog(mk(8), {});
    expect(r.radios).toHaveLength(8);
    expect(r.rest).toHaveLength(0);
  });
  it("more than 8: top 5 by count, ties by order", () => {
    const r = splitCatalog(mk(10), { s9: 4, s8: 4, s10: 1 });
    expect(r.radios.map((s) => s.id)).toEqual(["s8", "s9", "s10", "s1", "s2"]);
    expect(r.rest.map((s) => s.id)).toEqual(["s3", "s4", "s5", "s6", "s7"]);
  });
});

describe("topServices", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => svc({ id: `s${i + 1}`, sort_order: i + 1 }));
  it("top 3 by count in rank order", () => {
    const r = topServices(mk(6), { s5: 9, s2: 5, s6: 7, s1: 1 });
    expect(r.radios.map((s) => s.id)).toEqual(["s5", "s6", "s2"]);
  });
  it("ties fall back to sort_order", () => {
    const r = topServices(mk(6), { s4: 2, s3: 2 });
    expect(r.radios.map((s) => s.id)).toEqual(["s3", "s4", "s1"]);
  });
  it("rest keeps catalog order and excludes the top", () => {
    const r = topServices(mk(6), { s5: 9, s2: 5, s6: 7 });
    expect(r.rest.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });
  it("3 or fewer services leave rest empty", () => {
    expect(topServices(mk(3), {}).rest).toEqual([]);
    expect(topServices(mk(2), {}).radios).toHaveLength(2);
  });
});

describe("prefillFromService", () => {
  const types = [{ id: "t1", name: "Letter" }, { id: "t2", name: "Request" }];
  it("maps the fields", () => {
    const p = prefillFromService(svc({ confidential: true }), types, "2026-11-23");
    expect(p).toMatchObject({ document_type_id: "t2", transaction_type: "G2C", arta_class: "simple", confidentiality: "confidential" });
    expect(p.due_date).toBe("2026-11-26");
  });
  it("falls back to Letter; not confidential stays unset", () => {
    const p = prefillFromService(svc({ doc_type_name: "Unknown" }), types, "2026-11-23");
    expect(p.document_type_id).toBe("t1");
    expect(p.confidentiality).toBeUndefined();
  });
});

// Mon 2026-11-23, 08:00 Manila = 00:00Z
const at = (h: number, m = 0, day = 23) => new Date(Date.UTC(2026, 10, day, h - 8, m)).toISOString();
const steps = (): ServiceStep[] => [
  { n: 1, action: "Receive", by: "Clerk", minutes: 5, done_at: at(9), done_by: "me", route_id: null },
  { n: 2, action: "Check", by: "Clerk", minutes: 10, done_at: at(9, 20), done_by: "me", route_id: "r2" },
  { n: 3, action: "Issue", by: "Head", minutes: null },
  { n: 4, action: "Release", by: "Clerk", minutes: 5 },
];

describe("stepsView", () => {
  it("marks done, next and todo; step 1 never slow; flags slow ticks", () => {
    const v = stepsView(steps(), at(9, 30));
    expect(v.rows.map((r) => r.state)).toEqual(["done", "done", "next", "todo"]);
    expect(v.rows[0].slow).toBe(false);
    expect(v.rows[1]).toMatchObject({ took: 20, slow: true });
    expect(v.rows[2].slow).toBe(false);
    expect(v.allDone).toBe(false);
  });
  it("a step without a standard is never slow; totals compare with the standard", () => {
    const s = steps();
    s[2].done_at = at(15);
    s[2].done_by = "me";
    const v = stepsView(s, at(16));
    expect(v.rows[2].slow).toBe(false);
    expect(v.standard).toBe(20);
    expect(v.over).toBe(true);
  });
  it("within the time", () => {
    const s = steps().slice(0, 2);
    s[1].done_at = at(9, 5);
    const v = stepsView(s, at(10));
    expect(v.allDone).toBe(true);
    expect(v.over).toBe(false);
  });
});

describe("charterSlowByRoute", () => {
  it("returns slow ticks by route id", () => {
    expect(charterSlowByRoute(steps())).toEqual({ r2: { took: 20, standard: 10 } });
    expect(charterSlowByRoute(null)).toEqual({});
  });
});

describe("canMarkStep", () => {
  const base = {
    role: "staff" as const, meId: "me", meOfficeId: "o1", windowFlag: false,
    record: { status: "received" as const, current_office_id: "o1", assigned_to: null as string | null, service_steps: steps() },
  };
  it("assignee, head, window staff", () => {
    expect(canMarkStep({ ...base, record: { ...base.record, assigned_to: "me" } })).toBe(true);
    expect(canMarkStep({ ...base, role: "dept_head" })).toBe(true);
    expect(canMarkStep({ ...base, windowFlag: true })).toBe(true);
    expect(canMarkStep(base)).toBe(false);
  });
  it("other office, finished status, admin, no steps, all done", () => {
    expect(canMarkStep({ ...base, role: "dept_head", meOfficeId: "o2" })).toBe(false);
    expect(canMarkStep({ ...base, role: "dept_head", record: { ...base.record, status: "completed" } })).toBe(false);
    expect(canMarkStep({ ...base, role: "admin" })).toBe(false);
    expect(canMarkStep({ ...base, role: "dept_head", record: { ...base.record, service_steps: null } })).toBe(false);
    const done = steps().map((s) => ({ ...s, done_at: at(9) }));
    expect(canMarkStep({ ...base, role: "dept_head", record: { ...base.record, service_steps: done } })).toBe(false);
  });
});

describe("canMarkStep with ignoreDone (Undo button)", () => {
  const done = steps().map((x) => ({ ...x, done_at: at(9) }));
  const o = { ignoreDone: true, role: "dept_head" as const, meId: "me", meOfficeId: "o1", windowFlag: false,
    record: { status: "received" as const, current_office_id: "o1", assigned_to: null as string | null, service_steps: done } };
  it("true when my office holds it, false when another does", () => {
    expect(canMarkStep(o)).toBe(true);
    expect(canMarkStep({ ...o, meOfficeId: "o2" })).toBe(false);
    expect(canMarkStep({ ...o, ignoreDone: false })).toBe(false);
  });
});

describe("canUndoStep", () => {
  const s = steps();
  it("last done step by me within 10 minutes", () => {
    expect(canUndoStep(s, 2, "me", new Date(at(9, 29)))).toBe(true);
    expect(canUndoStep(s, 2, "me", new Date(at(9, 30)))).toBe(false);
    expect(canUndoStep(s, 2, "me", new Date(at(9, 31)))).toBe(false);
  });
  it("not another user, not step 1, not a step that is not the last done", () => {
    expect(canUndoStep(s, 2, "other", new Date(at(9, 21)))).toBe(false);
    expect(canUndoStep(s, 1, "me", new Date(at(9, 1)))).toBe(false);
    expect(canUndoStep(s, 3, "me", new Date(at(9, 21)))).toBe(false);
  });
});

describe("parseSteps", () => {
  it("tolerates junk", () => {
    expect(parseSteps(null)).toBeNull();
    expect(parseSteps([1, { n: "x" }])).toBeNull();
    expect(parseSteps([{ n: 2, action: "b" }, { n: 1, action: "a", minutes: 3 }])?.map((x) => x.n)).toEqual([1, 2]);
  });
});
