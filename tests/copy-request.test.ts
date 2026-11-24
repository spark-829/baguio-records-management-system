import { describe, expect, it } from "vitest";
import { canDecide, canRelease, dpoTag, parseCopyForm } from "../src/lib/copy-request";

const base = { copy_source: "in-2026-12", copy_requester: "owner" };

describe("parseCopyForm", () => {
  it("normalises the tracking number", () => {
    const r = parseCopyForm({ ...base, copy_pages: "3", copy_fee: "50.00" });
    expect(r).toMatchObject({ ok: true, value: { source_tracking_no: "IN-2026-0012", pages: 3, fee_php: "50.00" } });
  });
  it("fails a representative without the authorization check", () => {
    expect("error" in parseCopyForm({ ...base, copy_requester: "representative" })).toBe(true);
    expect("ok" in parseCopyForm({ ...base, copy_requester: "representative", copy_auth: "on" })).toBe(true);
  });
  it("fails a bad fee, bad source and missing requester", () => {
    expect("error" in parseCopyForm({ ...base, copy_fee: "5o" })).toBe(true);
    expect("error" in parseCopyForm({ ...base, copy_source: "abc" })).toBe(true);
    expect("error" in parseCopyForm({ copy_source: "IN-2026-0001" })).toBe(true);
  });
});

describe("dpoTag", () => {
  it("covers the four states", () => {
    expect(dpoTag({ dpo_status: "pending" })).toMatchObject({ label: "Waiting for approval", tone: "amber" });
    expect(dpoTag({ dpo_status: "approved", dpo_name: "A", dpo_at: "x" })).toMatchObject({ tone: "emerald", name: "A" });
    expect(dpoTag({ dpo_status: "not_needed" })).toMatchObject({ label: "Not needed: not confidential", tone: "slate" });
    expect(dpoTag({ dpo_status: "refused" })).toMatchObject({ label: "Refused", tone: "red" });
  });
});

describe("canDecide", () => {
  const ok = { role: "dept_head", officeCode: "CLO", status: "received", dpoStatus: "pending" as const };
  it("allows only a CLO head on a received pending request", () => {
    expect(canDecide(ok)).toBe(true);
    expect(canDecide({ ...ok, status: "under_action" })).toBe(true);
    expect(canDecide({ ...ok, status: "forwarded" })).toBe(false);
    expect(canDecide({ ...ok, role: "staff" })).toBe(false);
    expect(canDecide({ ...ok, role: "admin" })).toBe(false);
    expect(canDecide({ ...ok, officeCode: "CGSO" })).toBe(false);
    expect(canDecide({ ...ok, dpoStatus: "approved" })).toBe(false);
  });
  it("lets the CLO decide a not-needed request whose source became confidential", () => {
    expect(canDecide({ ...ok, dpoStatus: "not_needed" })).toBe(false);
    expect(canDecide({ ...ok, dpoStatus: "not_needed", sourceConfidential: true })).toBe(true);
  });
});

describe("canRelease", () => {
  const ok = { role: "records_officer", userOfficeId: "a", currentOfficeId: "b", status: "registered", dpoStatus: "not_needed" as const, releasedAt: null, deleted: false };
  it("follows the RPC", () => {
    expect(canRelease(ok)).toBe(true);
    expect(canRelease({ ...ok, dpoStatus: "approved" })).toBe(true);
    expect(canRelease({ ...ok, dpoStatus: "pending" })).toBe(false);
    expect(canRelease({ ...ok, dpoStatus: "refused" })).toBe(false);
    expect(canRelease({ ...ok, releasedAt: "2026-11-24" })).toBe(false);
    expect(canRelease({ ...ok, role: "admin" })).toBe(false);
    expect(canRelease({ ...ok, role: "staff" })).toBe(false);
    expect(canRelease({ ...ok, role: "staff", currentOfficeId: "a" })).toBe(true);
    expect(canRelease({ ...ok, status: "forwarded" })).toBe(false);
  });
  it("needs approval when the source is now confidential", () => {
    expect(canRelease({ ...ok, sourceConfidential: true })).toBe(false);
    expect(canRelease({ ...ok, dpoStatus: "approved", sourceConfidential: true })).toBe(true);
  });
});
