import { describe, expect, it } from "vitest";
import { demoFilters } from "../src/lib/ai-demo";
import { dueText } from "../src/lib/labels";

const OFFICES = [
  { code: "CMO", name: "City Mayor's Office" },
  { code: "CEO", name: "City Engineering Office" },
  { code: "CTO", name: "City Treasurer's Office" },
];
const TYPES = ["Letter", "Memorandum", "Disbursement Voucher", "Request / Complaint"];

describe("questions in Taglish and everyday words", () => {
  it("understands a Taglish question about the drainage voucher", () => {
    const f = demoFilters("Nasaan na po yung voucher para sa drainage? Sino may hawak?", OFFICES, TYPES);
    expect(f.docType).toBe("Disbursement Voucher");
    expect(f.q).toBe("drainage");
  });

  it("treats 'letter' and 'papers' as any document, not the Letter type", () => {
    const f = demoFilters("letter about road repair last week", OFFICES, TYPES);
    expect(f.docType).toBeUndefined();
    expect(f.q).toBe("road repair");
    expect(f.explanation).toContain("last 2 weeks");
    const late = demoFilters("which papers are late", OFFICES, TYPES);
    expect(late.overdue).toBe(true);
    expect(late.q).toBeUndefined();
  });

  it("reads 'my office' and 'on my desk' as the person's own office", () => {
    const mine = demoFilters("What is waiting in my office?", OFFICES, TYPES, "CEO");
    expect(mine.office).toBe("CEO");
    expect(mine.q).toBeUndefined();
    expect(demoFilters("what is on my desk", OFFICES, TYPES, "CTO").office).toBe("CTO");
  });
});

describe("due dates in words", () => {
  const today = new Date("2026-11-20T03:00:00Z"); // Nov 20, 11 AM in Manila
  it("says how late or how soon", () => {
    expect(dueText("2026-11-18", today)).toBe("2 days late");
    expect(dueText("2026-11-19", today)).toBe("1 day late");
    expect(dueText("2026-11-20", today)).toBe("due today");
    expect(dueText("2026-11-21", today)).toBe("due in 1 day");
    expect(dueText(null, today)).toBe("");
  });
});
