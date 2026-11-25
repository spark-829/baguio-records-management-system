import { describe, expect, it } from "vitest";
import { demoFilters, demoIntake, demoSummary, isAiDemo } from "../src/lib/ai-demo";

const OFFICES = [
  { code: "CMO", name: "City Mayor's Office" },
  { code: "CEO", name: "City Engineering Office" },
  { code: "CTO", name: "City Treasurer's Office" },
  { code: "CPDO", name: "City Planning and Development Office" },
];
const TYPES = ["Letter", "Memorandum", "Disbursement Voucher", "Purchase Request", "Request", "Complaint"];

describe("demo mode switch", () => {
  it("is on without a key and off with one", () => {
    const old = process.env.SPARK_DEEPSEEK_API;
    const oldMode = process.env.AI_DEMO_MODE;
    delete process.env.AI_DEMO_MODE;
    delete process.env.SPARK_DEEPSEEK_API;
    expect(isAiDemo()).toBe(true);
    process.env.SPARK_DEEPSEEK_API = "sk-test";
    expect(isAiDemo()).toBe(false);
    process.env.AI_DEMO_MODE = "1";
    expect(isAiDemo()).toBe(true);
    if (old === undefined) delete process.env.SPARK_DEEPSEEK_API;
    else process.env.SPARK_DEEPSEEK_API = old;
    if (oldMode === undefined) delete process.env.AI_DEMO_MODE;
    else process.env.AI_DEMO_MODE = oldMode;
  });
});

describe("demo plain-language search", () => {
  it("finds a person after 'made by'", () => {
    const f = demoFilters("what file was made by Juan dela Cruz", OFFICES, TYPES);
    expect(f.person).toBe("Juan dela Cruz");
    expect(f.q).toBeUndefined();
  });
  it("reads overdue, office and topic", () => {
    const f = demoFilters("What did Engineering do about the Session Road request?", OFFICES, TYPES);
    expect(f.office).toBe("CEO");
    expect(f.q).toContain("session");
    const o = demoFilters("Which records are overdue?", OFFICES, TYPES);
    expect(o.overdue).toBe(true);
    expect(o.q).toBeUndefined();
  });
  it("recognises document types and tracking numbers", () => {
    expect(demoFilters("vouchers from treasury", OFFICES, TYPES)).toMatchObject({ docType: "Disbursement Voucher", office: "CTO" });
    expect(demoFilters("where is in-2026-0002", OFFICES, TYPES).q).toBe("IN-2026-0002");
  });
});

describe("demo intake and summary", () => {
  it("returns a sample shaped like the real AI result, using only known types and offices", () => {
    const r = demoIntake("scan.pdf", TYPES, OFFICES);
    expect(TYPES).toContain(r.document_type);
    expect(OFFICES.map((o) => o.code)).toContain(r.suggested_office_code);
    expect(r.document_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.extracted_text.length).toBeGreaterThan(100);
  });
  it("summarises a record from its fields and latest action", () => {
    const s = demoSummary(
      { direction: "incoming", subject: "Request for road repair", sender_name: "Pedro Cruz", sender_org: "Barangay Irisan", status: "under_action", due_date: "2000-01-01", current_office: { name: "City Engineering Office" } },
      [{ status: "under_action", action_taken: "Site inspection scheduled", remarks: null }],
    );
    expect(s).toContain("from Pedro Cruz of Barangay Irisan");
    expect(s).toContain("overdue");
    expect(s).toContain("Site inspection scheduled");
  });
});

describe("demo search does not over-match", () => {
  it("does not treat the word 'requests' as a document type", () => {
    const f = demoFilters("urgent road requests from barangays this month", OFFICES, TYPES);
    expect(f.docType).toBeUndefined();
    expect(f.q).toContain("road");
  });
  it("maps 'complaint' to the complaint type", () => {
    expect(demoFilters("show the administrative complaint", OFFICES, TYPES).docType).toBe("Complaint");
  });
});
