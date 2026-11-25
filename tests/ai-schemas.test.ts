import { describe, expect, it } from "vitest";
import { intakeModelSchema, searchModelSchema } from "../src/lib/ai-schemas";

const TYPES = ["Letter", "Memorandum"];
const CODES = ["CMO", "CEO"];
const schema = intakeModelSchema(TYPES, CODES);
const good = { direction: "incoming", subject: "Road repair", document_type: "letter", suggested_office_code: "ceo", priority: "urgent", confidentiality: "public", document_date: "2026-11-01", keywords: ["Road", "road", "Repair"], extracted_text: "x".repeat(900) };

describe("intake model schema", () => {
  it("maps the old type name Request / Complaint to Request", () => {
    const s = intakeModelSchema(["Letter", "Request", "Complaint"], CODES);
    expect(s.parse({ ...good, document_type: "Request / Complaint" }).document_type).toBe("Request");
  });
  it("matches types and offices ignoring case and trims long text", () => {
    const r = schema.parse(good);
    expect(r.document_type).toBe("Letter");
    expect(r.suggested_office_code).toBe("CEO");
    expect(r.keywords).toEqual(["road", "repair"]);
    expect(r.extracted_text.length).toBe(600);
    expect(r.document_date).toBe("2026-11-01");
  });
  it("uses safe defaults for bad values", () => {
    const r = schema.parse({ ...good, suggested_office_code: "ZZZ", document_type: "Poem", priority: "huge", confidentiality: "x", document_date: "Nov 1" });
    expect(r.suggested_office_code).toBe("");
    expect(r.document_type).toBe("");
    expect(r.priority).toBe("normal");
    expect(r.confidentiality).toBe("internal");
    expect(r.document_date).toBeNull();
  });
  it("fails without a subject", () => {
    expect(schema.safeParse({ ...good, subject: undefined }).success).toBe(false);
  });
});

describe("search model schema", () => {
  it("defaults broken fields", () => {
    const r = searchModelSchema.parse({ q: 5, direction: "sideways", status: "done", overdue: "yes" });
    expect(r).toMatchObject({ q: null, direction: null, status: null, overdue: false, explanation: "" });
  });
});
