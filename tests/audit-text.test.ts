import { describe, expect, it } from "vitest";
import { integrityErrorText, routeText } from "../src/lib/audit-text";

const lk = {
  tracking: new Map([["r1", "IN-2026-0062"]]),
  offices: new Map([["a", "City Engineering Office"], ["b", "City Treasurer's Office"]]),
};

describe("routeText", () => {
  it("names the record and office", () => {
    expect(routeText({ record_id: "r1", status: "received", from_office_id: "a", to_office_id: "a", action_taken: "Received (QR scan)" }, lk))
      .toBe("IN-2026-0062 · Received at City Engineering Office: Received (QR scan)");
  });

  it("shows both offices for a forward", () => {
    const text = routeText({ record_id: "r1", status: "forwarded", from_office_id: "a", to_office_id: "b", action_taken: "Sent" }, lk);
    expect(text).toContain("(City Engineering Office → City Treasurer's Office)");
  });

  it("handles missing lookups without printing undefined", () => {
    const text = routeText({ record_id: "zz", status: "received", action_taken: "Received" }, { tracking: new Map(), offices: new Map() });
    expect(text).toBe("Received: Received");
    expect(text).not.toContain("undefined");
  });
});

describe("integrityErrorText", () => {
  it("explains a timeout without the raw error", () => {
    const a = integrityErrorText({ code: "57014", message: "x" });
    const b = integrityErrorText({ message: "canceling statement due to statement timeout" });
    expect(a).toMatch(/taking longer/);
    expect(b).toBe(a);
    expect(b).not.toMatch(/canceling/);
  });
  it("uses a generic message for other errors", () => {
    expect(integrityErrorText({ code: "42501", message: "permission denied" })).toBe("Could not run the integrity check right now. Try again in a minute.");
  });
});
