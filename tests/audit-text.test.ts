import { describe, expect, it } from "vitest";
import { integrityErrorText, routeText, checkCoverageText } from "../src/lib/audit-text";

describe("checkCoverageText", () => {
  const fmt = (s: string) => `on ${s}`;
  it("says how far it got while entries are pending", () => {
    const r = checkCoverageText({ verified_to_id: 100, pending: 25, last_full_pass_at: null }, fmt);
    expect(r.key).toContain("newer entries will be checked");
    expect(r.vars).toEqual({ n: "100", pending: "25" });
  });
  it("gives the last full re-check date when nothing is pending", () => {
    const r = checkCoverageText({ verified_to_id: 100, pending: 0, last_full_pass_at: "2026-11-24T01:00:00Z" }, fmt);
    expect(r.key).toContain("the last full re-check finished {when}");
    expect(r.vars).toEqual({ when: "on 2026-11-24T01:00:00Z" });
  });
  it("says the first full re-check is running when there is no date", () => {
    const r = checkCoverageText({ verified_to_id: 100, pending: 0, last_full_pass_at: null }, fmt);
    expect(r.key).toContain("the first full re-check is still running");
    expect(r.vars).toEqual({});
  });
});

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
