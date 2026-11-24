import { describe, expect, it } from "vitest";
import { attentionItems, findingText, parseSecuritySummary } from "../src/lib/security-hub";
import type { SecuritySummary } from "../src/lib/security-hub";

const NOW = new Date("2026-11-24T10:00:00Z");

const clean = (): SecuritySummary => ({
  asOf: NOW.toISOString(),
  threshold: 5,
  bulkThreshold: 20,
  counts: { loginFailed: 0, signedIn: 3, confidentialOpened: 0, downloads: 0, afterHours: 0, afterHoursConfidential: 0 },
  lockedNow: 0,
  admins: { total: 1, withMfa: 1 },
  repeatedFailures: [],
  bulkDownloads: [],
  events: [],
  audit: { total: 100, pending: 0, checkedAt: new Date(NOW.getTime() - 3600_000).toISOString(), lastFullPassAt: null },
});

describe("parseSecuritySummary", () => {
  it("returns null on garbage", () => {
    expect(parseSecuritySummary(null)).toBeNull();
    expect(parseSecuritySummary("x")).toBeNull();
    expect(parseSecuritySummary([1])).toBeNull();
  });
  it("fills defaults", () => {
    const s = parseSecuritySummary({})!;
    expect(s.counts.loginFailed).toBe(0);
    expect(s.lockedNow).toBe(0);
    expect(s.repeatedFailures).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.audit).toBeNull();
  });
  it("reads values and the audit block", () => {
    const s = parseSecuritySummary({
      threshold: "5", locked_now: "2", counts: { login_failed: 4 }, admins: { total: 2, with_mfa: 1 },
      audit: { total: 9, pending: 1, checked_at: "2026-11-24T00:00:00Z" },
      repeated_failures: [{ user_id: "u1", email: "a@b.c", n: 6 }],
    })!;
    expect(s.threshold).toBe(5);
    expect(s.lockedNow).toBe(2);
    expect(s.counts.loginFailed).toBe(4);
    expect(s.audit).toMatchObject({ total: 9, pending: 1, checkedAt: "2026-11-24T00:00:00Z" });
    expect(s.repeatedFailures[0]).toEqual({ userId: "u1", email: "a@b.c", n: 6 });
  });
});

describe("attentionItems", () => {
  it("is empty when all is well", () => {
    expect(attentionItems(clean(), NOW)).toEqual([]);
  });
  it("uses singular and plural for locked accounts", () => {
    const s = clean();
    s.lockedNow = 1;
    expect(attentionItems(s, NOW)[0]).toMatchObject({ key: "1 account is locked after too many wrong passwords.", href: "/admin/users?locked=1", linkKey: "Review in Users" });
    s.lockedNow = 3;
    expect(attentionItems(s, NOW)[0]).toMatchObject({ key: "{n} accounts are locked after too many wrong passwords.", vars: { n: 3 } });
  });
  it("flags admins without the second step, singular and plural", () => {
    const s = clean();
    s.admins = { total: 2, withMfa: 1 };
    expect(attentionItems(s, NOW)[0]).toMatchObject({ tone: "act", key: "1 administrator account does not use the second sign-in step.", href: "/admin/users" });
    s.admins = { total: 4, withMfa: 1 };
    expect(attentionItems(s, NOW)[0]).toMatchObject({ key: "{n} administrator accounts do not use the second sign-in step.", vars: { n: 3 } });
  });
  it("links repeated failures and bulk downloads with an encoded user", () => {
    const s = clean();
    s.repeatedFailures = [{ userId: "a b&c", email: "x@y.z", n: 7 }];
    s.bulkDownloads = [{ userId: "u/2", name: "Ana", n: 25 }];
    const [a, b] = attentionItems(s, NOW);
    expect(a).toMatchObject({ tone: "check", key: "{n} wrong-password attempts for {email} in 24 hours.", vars: { n: 7, email: "x@y.z" }, href: "/admin/access?event=login_failed&user=a%20b%26c", linkKey: "See attempts" });
    expect(b).toMatchObject({ tone: "check", key: "{name} downloaded {n} files within one hour.", vars: { name: "Ana", n: 25 }, href: "/admin/access?user=u%2F2&event=download", linkKey: "See downloads" });
  });
  it("flags confidential records opened after hours, singular and plural", () => {
    const s = clean();
    s.counts.afterHoursConfidential = 1;
    expect(attentionItems(s, NOW)[0]).toMatchObject({ key: "1 confidential record was opened outside office hours.", href: "/admin/access?event=view_record", linkKey: "See who" });
    s.counts.afterHoursConfidential = 4;
    expect(attentionItems(s, NOW)[0]).toMatchObject({ key: "{n} confidential records were opened outside office hours.", vars: { n: 4 } });
  });
  it("puts Act items before Check items and caps at 6", () => {
    const s = clean();
    s.counts.afterHoursConfidential = 2;
    s.repeatedFailures = [1, 2, 3].map((i) => ({ userId: `u${i}`, email: `e${i}`, n: 9 }));
    s.bulkDownloads = [1, 2, 3].map((i) => ({ userId: `d${i}`, name: `n${i}`, n: 30 }));
    s.lockedNow = 2;
    s.admins = { total: 2, withMfa: 0 };
    const items = attentionItems(s, NOW);
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.tone)).toEqual(["act", "act", "check", "check", "check", "check"]);
  });
  it("gives no audit row when audit is null", () => {
    const s = clean();
    s.audit = null;
    expect(attentionItems(s, NOW)).toEqual([]);
  });
  it("shows the audit-age row when the check is 25h old, not when it is 1h old", () => {
    const s = clean();
    s.audit = { ...s.audit!, checkedAt: new Date(NOW.getTime() - 25 * 3600_000).toISOString() };
    const old = attentionItems(s, NOW, () => "DATE");
    expect(old).toHaveLength(1);
    expect(old[0]).toMatchObject({ key: "The audit log was last checked {date}.", vars: { date: "DATE" }, href: "/admin/audit" });
    expect(attentionItems(clean(), NOW)).toEqual([]);
  });
  it("says so when the audit log was never checked", () => {
    const s = clean();
    s.audit = { ...s.audit!, checkedAt: null };
    expect(attentionItems(s, NOW)[0].key).toBe("The audit log has not been checked yet.");
  });
});

describe("findingText", () => {
  it("handles 0, 1 and many", () => {
    expect(findingText(0).key).toBe("Nothing needs you right now.");
    expect(findingText(1).key).toBe("1 thing needs you today.");
    expect(findingText(3)).toEqual({ key: "{n} things need you today.", vars: { n: 3 } });
  });
});
