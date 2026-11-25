import { describe, expect, it } from "vitest";
import { matchDocType, seriesLabel } from "../src/lib/doc-types";

const TYPES = ["Letter", "Request", "Complaint"];

describe("matchDocType", () => {
  it("ignores case and spaces", () => expect(matchDocType(" letter ", TYPES)).toBe("Letter"));
  it("maps the old Request / Complaint name to Request when listed", () => {
    expect(matchDocType("Request / Complaint", TYPES)).toBe("Request");
  });
  it("returns undefined for the old name when Request is not listed", () => {
    expect(matchDocType("Request / Complaint", ["Letter", "Complaint"])).toBeUndefined();
  });
  it("keeps Complaint as Complaint", () => expect(matchDocType("Complaint", TYPES)).toBe("Complaint"));
  it("returns undefined for empty and prototype names", () => {
    for (const v of ["", null, "constructor", "__proto__"]) expect(matchDocType(v, TYPES)).toBeUndefined();
  });
});

describe("seriesLabel", () => {
  it("joins code and title", () => {
    expect(seriesLabel({ series_code: "ADM-COR", series_title: "Correspondence" })).toBe("ADM-COR · Correspondence");
  });
  it("shows code only", () => expect(seriesLabel({ series_code: "ADM-COR", series_title: null })).toBe("ADM-COR"));
  it("is empty without a code", () => {
    expect(seriesLabel({ series_code: null, series_title: "Correspondence" })).toBe("");
    expect(seriesLabel(null)).toBe("");
  });
});
