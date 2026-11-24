import { describe, expect, it } from "vitest";
import {
  boxErrorText, boxMoveText, boxPrefix, boxWhere, isBoxCode, nextBoxCode, normalizeBoxCode, parseBoxForm, yearsText,
} from "../src/lib/boxes";

const OFFICE = "123e4567-e89b-12d3-a456-426614174000";
const base = { code: "cgso 2026 012", office_id: OFFICE, room: " Room B ", shelf: "", contents: "", year_from: "", year_to: "", notes: "" };

describe("box codes", () => {
  it("turns spaces into dashes and upper-cases", () => {
    expect(normalizeBoxCode("  cgso 2026  012 ")).toBe("CGSO-2026-012");
    expect(normalizeBoxCode(null)).toBe("");
  });
  it("checks the pattern", () => {
    expect(isBoxCode("CGSO-2026-012")).toBe(true);
    expect(isBoxCode("A1")).toBe(false);
    expect(isBoxCode("-ABC")).toBe(false);
    expect(isBoxCode("AB_CD")).toBe(false);
    expect(isBoxCode("A".repeat(41))).toBe(false);
  });
  it("builds the prefix", () => {
    expect(boxPrefix("cgso", 2026)).toBe("CGSO-2026");
    expect(boxPrefix("C-G.S O", 2026)).toBe("CGSO-2026");
  });
  it("finds the next code", () => {
    expect(nextBoxCode("CGSO-2026", [])).toBe("CGSO-2026-001");
    expect(nextBoxCode("CGSO-2026", ["CGSO-2026-001", "CGSO-2026-005"])).toBe("CGSO-2026-006");
    expect(nextBoxCode("CGSO-2026", ["CEO-2026-009", "CGSO-2025-040", "CGSO-2026-ABC"])).toBe("CGSO-2026-001");
    expect(nextBoxCode("CGSO-2026", ["CGSO-2026-999"])).toBe("CGSO-2026-1000");
  });
});

describe("parseBoxForm", () => {
  it("accepts a good form and nulls the empty fields", () => {
    const r = parseBoxForm(base);
    expect(r).toEqual({
      ok: true,
      value: { code: "CGSO-2026-012", office_id: OFFICE, room: "Room B", shelf: null, contents: null, year_from: null, year_to: null, notes: null },
    });
  });
  it("reads years as numbers", () => {
    const r = parseBoxForm({ ...base, year_from: "2019", year_to: "2023" });
    expect(r.ok && [r.value.year_from, r.value.year_to]).toEqual([2019, 2023]);
  });
  it("reports every error", () => {
    const r = parseBoxForm({ ...base, code: "", office_id: "x", room: " " });
    expect(r).toEqual({ ok: false, errors: { code: "Enter a box code", office: "Choose the office", room: "Enter the room" } });
    expect(parseBoxForm({ ...base, code: "a_b" })).toMatchObject({
      errors: { code: "Use only letters, numbers and dashes in the box code, e.g. CGSO-2026-012" },
    });
    expect(parseBoxForm({ ...base, year_from: "19" })).toMatchObject({ errors: { years: "Enter the year as 4 digits, e.g. 2019" } });
    expect(parseBoxForm({ ...base, year_to: "1800" })).toMatchObject({ errors: { years: "Enter the year as 4 digits, e.g. 2019" } });
    expect(parseBoxForm({ ...base, year_from: "2023", year_to: "2019" })).toMatchObject({
      errors: { years: "The 'To' year must be the same as or after the 'From' year." },
    });
  });
  it("cuts long text", () => {
    const r = parseBoxForm({ ...base, room: "r".repeat(300), contents: "c".repeat(2000) });
    expect(r.ok && [r.value.room.length, r.value.contents?.length]).toEqual([100, 1000]);
  });
});

describe("text helpers", () => {
  it("boxWhere", () => {
    expect(boxWhere("Room B", "Shelf 4")).toBe("Room B, Shelf 4");
    expect(boxWhere("Room B", null)).toBe("Room B");
  });
  it("yearsText", () => {
    expect(yearsText(2019, 2023)).toEqual({ key: "{a} to {b}", vars: { a: 2019, b: 2023 } });
    expect(yearsText(2019, null)).toEqual({ key: "2019" });
    expect(yearsText(null, 2023)).toEqual({ key: "2023" });
    expect(yearsText(null, null)).toBeNull();
  });
  it("boxMoveText matches the database words", () => {
    expect(boxMoveText(null, "A-1")).toBe("Put in box A-1");
    expect(boxMoveText("A-1", null)).toBe("Taken out of box A-1");
    expect(boxMoveText("A-1", "B-2")).toBe("Moved from box A-1 to B-2");
  });
  it("boxErrorText", () => {
    expect(boxErrorText("no box with that code")).toBe("No box has that code. Check the label, or add the box first.");
    expect(boxErrorText("only the records desk puts records in boxes")).toBe("Only the records desk can put records in boxes.");
    expect(boxErrorText("record not found")).toBe("Record not found");
    expect(boxErrorText("something else")).toBe("something else");
  });
});
