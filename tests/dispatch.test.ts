import { describe, expect, it } from "vitest";
import {
  canRecordDelivery, deliveryErrorText, dayMonth, firstError, logbookCsvRows, manilaClock, manilaTime, parseDeliveryForm, parseLogbook,
  parseReleaseForm, receivedText, releaseErrorText, sentOutText,
} from "../src/lib/dispatch";

const TODAY = "2026-11-26";
const rel = (o: Record<string, unknown>) => parseReleaseForm({ method: "registered_mail", tracking: "RR123456789PH", sentOn: TODAY, ...o }, TODAY);

describe("parseReleaseForm", () => {
  it("needs a method", () => {
    expect(rel({ method: "" })).toMatchObject({ ok: false, errors: { method: "Choose how it was sent" } });
  });
  it("needs a tracking number for registered mail and courier", () => {
    expect(rel({ tracking: "" })).toMatchObject({ ok: false, errors: { tracking: "Enter the tracking number from the receipt" } });
    expect(rel({ method: "courier", tracking: "ab" })).toMatchObject({ ok: false, errors: { tracking: "Enter the tracking number from the receipt" } });
  });
  it("cleans the tracking number", () => {
    const r = rel({ tracking: "rr 123 456 789 ph" });
    expect(r.ok && r.value.tracking).toBe("RR123456789PH");
  });
  it("drops tracking and courier for hand delivery and email", () => {
    for (const method of ["hand", "email"]) {
      const r = rel({ method, tracking: "RR123456789PH", courier: "LBC" });
      expect(r.ok && [r.value.tracking, r.value.courier]).toEqual([null, null]);
    }
  });
  it("keeps the courier name for a courier", () => {
    const r = rel({ method: "courier", courier: " LBC ", tracking: "123456" });
    expect(r.ok && r.value.courier).toBe("LBC");
  });
  it("refuses a future or bad date", () => {
    expect(rel({ sentOn: "2026-11-27" })).toMatchObject({ errors: { sentOn: "The date sent cannot be in the future." } });
    expect(rel({ sentOn: "nope" })).toMatchObject({ errors: { sentOn: "Enter the date sent" } });
    expect(rel({ sentOn: "1999-12-31" })).toMatchObject({ errors: { sentOn: "Enter the date sent" } });
    expect(rel({ sentOn: "2026-02-31" })).toMatchObject({ errors: { sentOn: "Enter the date sent" } });
  });
  it("firstError", () => {
    expect(firstError({ method: undefined, tracking: "x" })).toBe("x");
  });
});

describe("sentOutText", () => {
  it("matches the database history text", () => {
    expect(sentOutText("registered_mail", null, "RR123456789PH")).toBe("Sent out by Registered mail (PHLPost), tracking RR123456789PH");
    expect(sentOutText("courier", "LBC", "123456")).toBe("Sent out by LBC, tracking 123456");
    expect(sentOutText("courier", "", "123456")).toBe("Sent out by courier, tracking 123456");
    expect(sentOutText("hand", null, null)).toBe("Sent out by hand delivery");
    expect(sentOutText("email", null, null)).toBe("Sent out by email");
    expect(sentOutText("other", null, null)).toBe("Sent out by other means");
  });
});

describe("parseDeliveryForm", () => {
  const f = (o: Record<string, unknown>) => parseDeliveryForm({ receivedBy: "Maria Santos", receivedOn: "2026-11-26", ...o }, "2026-11-25", TODAY);
  it("accepts a good form", () => {
    expect(f({ note: " ok " })).toEqual({ ok: true, value: { receivedBy: "Maria Santos", receivedOn: "2026-11-26", note: "ok" } });
  });
  it("checks the name and dates", () => {
    expect(f({ receivedBy: " M " })).toMatchObject({ errors: { receivedBy: "Type the name of the person who received it." } });
    expect(f({ receivedOn: "" })).toMatchObject({ errors: { receivedOn: "Enter the date received" } });
    expect(f({ receivedOn: "2026-11-24" })).toMatchObject({ errors: { receivedOn: "The date received cannot be before the date sent." } });
    expect(f({ receivedOn: "2026-11-27" })).toMatchObject({ errors: { receivedOn: "The date received cannot be in the future." } });
  });
});

describe("canRecordDelivery", () => {
  const base = { role: "staff" as const, userOfficeId: "A", originOfficeId: "A", currentOfficeId: "A", status: "released" as const, deleted: false, received: false };
  it("allows the records desk and the sending office", () => {
    expect(canRecordDelivery({ ...base, role: "records_officer", userOfficeId: "Z" })).toBe(true);
    expect(canRecordDelivery(base)).toBe(true);
    expect(canRecordDelivery({ ...base, role: "dept_head" })).toBe(true);
  });
  it("refuses other offices, admin and viewer", () => {
    expect(canRecordDelivery({ ...base, userOfficeId: "B" })).toBe(false);
    expect(canRecordDelivery({ ...base, role: "admin" })).toBe(false);
    expect(canRecordDelivery({ ...base, role: "viewer" })).toBe(false);
  });
  it("refuses wrong status, deleted and already received", () => {
    expect(canRecordDelivery({ ...base, status: "completed" })).toBe(false);
    expect(canRecordDelivery({ ...base, deleted: true })).toBe(false);
    expect(canRecordDelivery({ ...base, received: true })).toBe(false);
  });
});

describe("logbook", () => {
  const row = {
    record_id: "r1", tracking_no: "OUT-2026-0001", subject: "Letter", recipient: "Maria, DPWH", office_code: "CGSO", office_name: "GSO",
    method: "courier", courier: "LBC", courier_tracking: "123456", sent_on: "2026-11-26", sent_at: "2026-11-26T01:30:00Z",
    sent_by: "Ana", received_by: "Maria Santos", received_on: "2026-11-26",
  };
  it("parseLogbook drops junk", () => {
    expect(parseLogbook(null)).toEqual([]);
    expect(parseLogbook([null, 5, "x", { subject: "no number" }, { tracking_no: "" }])).toEqual([]);
    expect(parseLogbook([row, { tracking_no: "OUT-1" }])).toHaveLength(2);
    expect(parseLogbook([row])[0]).toEqual(row);
  });
  it("formats days and times", () => {
    expect(dayMonth("2026-11-26")).toBe("Nov 26");
    expect(dayMonth("2026-01-05")).toBe("Jan 5");
    expect(manilaClock("2026-11-26T01:30:00Z")).toBe("9:30 AM");
    expect(manilaClock("2026-11-26T04:05:00Z")).toBe("12:05 PM");
    expect(manilaClock("2026-11-26T16:05:00Z")).toBe("12:05 AM");
    expect(manilaTime("2026-11-26T01:30:00Z")).toBe("09:30");
    expect(manilaTime("2026-11-26T17:05:00Z")).toBe("01:05");
  });
  it("receivedText", () => {
    expect(receivedText(row)).toBe("Maria Santos, Nov 26");
    expect(receivedText({ received_by: null, received_on: null })).toBe("—");
  });
  it("csv rows", () => {
    const { header, lines } = logbookCsvRows([row]);
    expect(header).toEqual([
      "Time", "Record no.", "Subject", "To whom", "How sent", "Courier", "Courier tracking no.", "Sent by", "Received by", "Date received",
    ]);
    expect(lines[0]).toEqual(["09:30", "OUT-2026-0001", "Letter", "Maria, DPWH", "Courier (LBC, J&T and others)", "LBC", "123456", "Ana", "Maria Santos", "2026-11-26"]);
  });
});

describe("error text", () => {
  it("maps release messages", () => {
    expect(releaseErrorText("choose how it was sent")).toBe("Choose how it was sent");
    expect(releaseErrorText("enter the tracking number from the receipt")).toBe("Enter the tracking number from the receipt");
    expect(releaseErrorText("the date sent cannot be in the future")).toBe("The date sent cannot be in the future.");
    expect(releaseErrorText("this record was already sent out")).toBe("This record was already sent out.");
    expect(releaseErrorText("only a record the City sends out can be marked as sent out")).toBe("Only a record the City sends out can be marked as sent out.");
    expect(releaseErrorText("only the records desk or the office holding the record can send it out")).toBe("Only the office holding this record, or the records desk, can act on it.");
    expect(releaseErrorText("that step is not allowed for a record that is received")).toBe("That action is not available for this record.");
    expect(releaseErrorText("boom")).toBe("boom");
  });
  it("maps delivery messages", () => {
    expect(deliveryErrorText("delivery is already recorded")).toBe("Delivery is already recorded.");
    expect(deliveryErrorText("delivery can be recorded only while the record is sent out")).toBe("Delivery can be recorded only while the record is sent out.");
    expect(deliveryErrorText("only the records desk or the sending office can record delivery")).toBe("Only the records desk or the sending office can record delivery.");
    expect(deliveryErrorText("type the name of the person who received it")).toBe("Type the name of the person who received it.");
    expect(deliveryErrorText("the date received cannot be before the date sent")).toBe("The date received cannot be before the date sent.");
    expect(deliveryErrorText("the date received cannot be in the future")).toBe("The date received cannot be in the future.");
  });
});
