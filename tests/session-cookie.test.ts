import { describe, expect, it } from "vitest";
import { hardenCookie, isBackgroundRequest, readSeen, sessionExpired, signSeen, SESSION_MAX_AGE } from "../src/lib/session-cookie";

const U = "11111111-2222-3333-4444-555555555555";

describe("session cookie", () => {
  it("round-trips a signed sign-in and last-seen time", async () => {
    const v = await signSeen("k", U, { start: 1_699_999_000, seen: 1_700_000_000, limit: 15 });
    expect(await readSeen("k", U, v)).toEqual({ start: 1_699_999_000, seen: 1_700_000_000, limit: 15 });
  });
  it("refuses another user, another key, or an edited time", async () => {
    const v = await signSeen("k", U, { start: 1_699_999_000, seen: 1_700_000_000, limit: 15 });
    expect(await readSeen("k", "other", v)).toBeNull();
    expect(await readSeen("k2", U, v)).toBeNull();
    expect(await readSeen("k", U, v.replace("1700000000", "1800000000"))).toBeNull();
    expect(await readSeen("k", U, v.replace(".15.", ".0."))).toBeNull();
    expect(await readSeen("k", U, undefined)).toBeNull();
    expect(await readSeen("k", U, "garbage")).toBeNull();
  });
  it("expires after the idle limit plus grace, or after 12 hours", () => {
    const s = (seen: number, limit: number, start = 1000) => ({ start, seen, limit });
    expect(sessionExpired(s(1000, 15), 1000 + 15 * 60 + 60)).toBe(false);
    expect(sessionExpired(s(1000, 15), 1000 + 15 * 60 + 121)).toBe(true);
    expect(sessionExpired(s(5000, 0), 6000)).toBe(false);
    expect(sessionExpired(s(1000 + SESSION_MAX_AGE, 15), 1000 + SESSION_MAX_AGE + 1)).toBe(true);
    expect(sessionExpired(s(10_000, 15), 1000)).toBe(true);
  });
  it("hardens Supabase cookie options and keeps deletes", () => {
    expect(hardenCookie({ maxAge: 400 * 86400, sameSite: "none" }, true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
    expect(hardenCookie({ maxAge: 0 }, true).maxAge).toBe(0);
    expect(hardenCookie(undefined, false)).toMatchObject({ secure: false, maxAge: SESSION_MAX_AGE });
  });
  it("treats polls and prefetches as background", () => {
    expect(isBackgroundRequest(new Headers({ "x-rms-background": "1" }))).toBe(true);
    expect(isBackgroundRequest(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isBackgroundRequest(new Headers({}))).toBe(false);
  });
});
