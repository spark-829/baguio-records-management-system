import { describe, expect, it } from "vitest";
import { errorItems, filingSummary, routeFile, serverErrorField } from "../src/lib/register-desk";

const MB = 1024 * 1024;
const t = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : s);

describe("routeFile", () => {
  it("routes .eml by name and by type", () => {
    expect(routeFile({ name: "Letter.EML", type: "", size: 100 })).toEqual({ kind: "eml" });
    expect(routeFile({ name: "x", type: "message/rfc822", size: 100 })).toEqual({ kind: "eml" });
  });
  it("rejects an email over 25 MB", () => {
    expect(routeFile({ name: "a.eml", type: "", size: 25 * MB + 1 })).toEqual({ kind: "error", message: "This email file is larger than 25 MB." });
    expect(routeFile({ name: "a.eml", type: "", size: 25 * MB }).kind).toBe("eml");
  });
  it("PDF limit is 10 MB", () => {
    expect(routeFile({ name: "a.pdf", type: "application/pdf", size: 10 * MB + 1 }).kind).toBe("error");
    expect(routeFile({ name: "a.pdf", type: "application/pdf", size: 10 * MB })).toEqual({ kind: "attachment" });
  });
  it("any size of an allowed image is an attachment", () => {
    expect(routeFile({ name: "a.jpg", type: "image/jpeg", size: 30 * MB })).toEqual({ kind: "attachment" });
    expect(routeFile({ name: "a.webp", type: "image/webp", size: 30 * MB })).toEqual({ kind: "attachment" });
    expect(routeFile({ name: "a.heic", type: "image/heic", size: 30 * MB }).kind).toBe("error");
    expect(routeFile({ name: "a.gif", type: "image/gif", size: 10 }).kind).toBe("error");
  });
  it("rejects other types and empty files", () => {
    expect(routeFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 })).toEqual({
      kind: "error",
      message: "Use a PDF, JPG or PNG file, or an email saved as .eml.",
    });
    expect(routeFile({ name: "a.pdf", type: "application/pdf", size: 0 })).toEqual({ kind: "error", message: "This file is empty. Choose another file." });
  });
});

describe("filingSummary", () => {
  const base = { direction: "incoming" as const, priority: "normal", confidentiality: "internal", mode: "walk-in", arta_class: "" };
  it("defaults", () => {
    expect(filingSummary(base, t)).toBe("Normal priority · Internal · Hand-carried · No ARTA time");
  });
  it("internal mode depends on direction", () => {
    expect(filingSummary({ ...base, mode: "internal" }, t)).toContain("From another City office");
    expect(filingSummary({ ...base, direction: "outgoing", mode: "internal" }, t)).toContain("To another City office");
  });
  it("shows the ARTA label", () => {
    expect(filingSummary({ ...base, arta_class: "simple" }, t)).toContain("Simple (3 working days)");
  });
  it("reply number only for outgoing", () => {
    expect(filingSummary({ ...base, direction: "outgoing", in_reply_to: " IN-2026-0001 " }, t)).toMatch(/In reply to IN-2026-0001$/);
    expect(filingSummary({ ...base, in_reply_to: "IN-2026-0001" }, t)).not.toContain("In reply to");
  });
});

describe("serverErrorField", () => {
  it.each([
    ["Subject is too short", "f-subject"],
    ["Choose a document type", "f-document_type_id"],
    ["Choose the transaction type.", "f-tx-G2C"],
    ["Keep the reference number under 40 characters.", "f-reference_no"],
    ["The reference number box is turned off for your office.", "f-reference_no"],
    ["Type the tracking number of the received letter, for example IN-2026-0001.", "f-in_reply_to"],
    ["No received record with that tracking number that you can open. Check the number.", "f-in_reply_to"],
    ["No record with that tracking number. Check the number.", "f-copy_source"],
    ["choose a service from the Citizen's Charter list", "f-service"],
    ["choose a service of your own office", "f-service"],
    ["File is larger than 10 MB", "file-pick"],
    ["Use a PDF, PNG, JPG or WEBP file", "file-pick"],
    ["Choose a file", "file-pick"],
  ])("%s", (msg, id) => {
    expect(serverErrorField(msg)).toBe(id);
  });
  it("unknown is null", () => {
    expect(serverErrorField("Check the form")).toBeNull();
  });
});

describe("errorItems", () => {
  it("maps missing fields, empty id to null, server item last", () => {
    expect(errorItems([{ id: "f-subject", label: "Subject" }, { id: "", label: "Who is asking?" }], "Subject is too short")).toEqual([
      { id: "f-subject", text: "Subject", server: false },
      { id: null, text: "Who is asking?", server: false },
      { id: "f-subject", text: "Subject is too short", server: true },
    ]);
  });
  it("no errors gives no items", () => {
    expect(errorItems([])).toEqual([]);
  });
});
