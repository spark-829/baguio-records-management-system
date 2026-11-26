import { describe, expect, it } from "vitest";
import { buildSigninNote, decodeSigninNote, deviceLabel, encodeSigninNote, statusFromHealth } from "../src/lib/signin-extras";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const EDGE_WIN = `${CHROME_WIN} Edg/131.0`;
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

describe("deviceLabel", () => {
  it("names common browsers and systems", () => {
    expect(deviceLabel(CHROME_WIN)).toBe("Chrome on Windows");
    expect(deviceLabel(EDGE_WIN)).toBe("Edge on Windows");
    expect(deviceLabel(SAFARI_IPHONE)).toBe("Safari on iPhone or iPad");
    expect(deviceLabel(FIREFOX_LINUX)).toBe("Firefox on Linux");
    expect(deviceLabel(CHROME_ANDROID)).toBe("Chrome on Android");
    expect(deviceLabel(null)).toBe("an unknown browser");
  });
});

describe("buildSigninNote", () => {
  it("says first sign-in when there is no earlier one", () => {
    expect(buildSigninNote({ first: true })).toEqual({ first: true });
  });

  it("flags a new network and a new device, not a browser update", () => {
    const base = { first: false, previous_at: "2026-11-25T07:04:00Z", previous_ua: CHROME_WIN, current_ua: CHROME_WIN, earlier_uas: [CHROME_WIN.replace("131", "130")] };
    expect(buildSigninNote({ ...base, new_ip: false })).toEqual({ first: false, at: "2026-11-25T07:04:00.000Z", device: "Chrome on Windows", newIp: false, newDevice: false });
    expect(buildSigninNote({ ...base, new_ip: true })).toMatchObject({ newIp: true, newDevice: false });
    expect(buildSigninNote({ ...base, current_ua: SAFARI_IPHONE })).toMatchObject({ newDevice: true });
  });

  it("does not flag an unknown browser, and ignores bad input", () => {
    expect(buildSigninNote({ first: false, previous_at: "2026-11-25T07:04:00Z", current_ua: "curl/8", earlier_uas: [CHROME_WIN] })).toMatchObject({ newDevice: false });
    expect(buildSigninNote(null)).toBeNull();
    expect(buildSigninNote({ first: false, previous_at: "not a date" })).toBeNull();
  });
});

describe("sign-in note cookie", () => {
  it("round-trips and rejects junk", () => {
    const note = buildSigninNote({ first: false, previous_at: "2026-11-25T07:04:00Z", previous_ua: CHROME_WIN, current_ua: CHROME_WIN, new_ip: true, earlier_uas: [CHROME_WIN] })!;
    const raw = (n: Parameters<typeof encodeSigninNote>[0]) => encodeURIComponent(encodeSigninNote(n)); // as Next sends it
    expect(decodeSigninNote(raw(note))).toEqual(note);
    expect(decodeSigninNote(raw({ first: true }))).toEqual({ first: true });
    expect(decodeSigninNote("%7B")).toBeNull();
    expect(decodeSigninNote(encodeURIComponent(JSON.stringify({ first: false, at: "x", device: "y" })))).toBeNull();
    expect(decodeSigninNote(undefined)).toBeNull();
  });
});

describe("statusFromHealth", () => {
  it("is up only when the database answers", () => {
    expect(statusFromHealth(true, { ok: true, app: "up", db: "up" })).toBe("up");
    expect(statusFromHealth(false, { ok: false, app: "up", db: "down" })).toBe("down");
    expect(statusFromHealth(true, null)).toBe("down");
  });
});
