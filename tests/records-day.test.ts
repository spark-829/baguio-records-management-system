import { describe, expect, it } from "vitest";
import { demoFilters } from "../src/lib/ai-demo";
import { trackingGuesses } from "../src/lib/search";
import { allowedActions } from "../src/lib/workflow";

const OFFICES = [
  { code: "CMO", name: "City Mayor's Office" },
  { code: "CEO", name: "City Engineering Office" },
  { code: "CBO", name: "City Budget Office" },
];
const TYPES = ["Letter", "Memorandum", "Disbursement Voucher", "Request / Complaint"];

describe("questions the records officer tried", () => {
  it("urgent road requests from barangays last month", () => {
    const f = demoFilters("urgent road requests from barangays last month", OFFICES, TYPES);
    expect(f.priority).toBe("urgent");
    expect(f.q).not.toMatch(/urgent/);
    expect(f.from).toBeTruthy();
  });
  it("vouchers waiting at the budget office", () => {
    const f = demoFilters("vouchers waiting at the budget office", OFFICES, TYPES);
    expect(f.office).toBe("CBO");
    expect(f.docType).toBe("Disbursement Voucher");
    expect(f.open).toBe(true);
    expect(f.q).toBeUndefined();
    expect(f.explanation).toContain("City Budget Office");
  });
  it("Taglish topic words are translated and fillers dropped", () => {
    const f = demoFilters("mga sulat galing barangay tungkol sa kalsada", OFFICES, TYPES);
    expect(f.q).toBe("barangay road");
  });
  it("galing names the sender", () => {
    const f = demoFilters("Nasaan na yung sulat galing Barangay Loakan tungkol sa drainage?", OFFICES, TYPES);
    expect(f.person).toBe("Barangay Loakan");
    expect(f.q).toBe("drainage");
  });
  it("vouchers not paid", () => {
    const f = demoFilters("Which disbursement vouchers are still not paid?", OFFICES, TYPES);
    expect(f.docType).toBe("Disbursement Voucher");
    expect(f.open).toBe(true);
    expect(f.q ?? "").not.toMatch(/paid|still/);
  });
  it("how many this month", () => {
    const f = demoFilters("How many records were logged this month?", OFFICES, TYPES);
    expect(f.q).toBeUndefined();
    expect(f.from).toMatch(/-01$/);
  });
});

describe("partial tracking numbers", () => {
  it("expands a bare number to this year's incoming and outgoing numbers", () => {
    expect(trackingGuesses("37", 2026)).toEqual(["IN-2026-0037", "OUT-2026-0037"]);
    expect(trackingGuesses("0001", 2026)).toEqual(["IN-2026-0001", "OUT-2026-0001"]);
    expect(trackingGuesses("2025-12", 2026)).toEqual(["IN-2025-0012", "OUT-2025-0012"]);
    expect(trackingGuesses("drainage")).toBeNull();
    expect(trackingGuesses("12345")).toBeNull();
  });
});

describe("incoming letters are never 'sent out'", () => {
  it("does not offer release on a completed incoming record", () => {
    const a = allowedActions({ status: "completed", direction: "incoming", role: "records_officer", userOfficeId: "x", currentOfficeId: "x" });
    expect(a).not.toContain("release");
  });
});
