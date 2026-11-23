import { describe, expect, it } from "vitest";
import { isReloadableError, shouldAutoReload } from "../src/lib/reload-error";

describe("isReloadableError", () => {
  it("spots stale-deploy and dropped-connection errors", () => {
    expect(isReloadableError({ name: "ChunkLoadError", message: "Loading chunk 123 failed." })).toBe(true);
    expect(isReloadableError(new Error("Connection closed."))).toBe(true);
    expect(isReloadableError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isReloadableError(new Error("network error"))).toBe(true);
    expect(isReloadableError({ name: "UnrecognizedActionError", message: 'Server Action "abc" was not found on the server.' })).toBe(true);
    expect(isReloadableError(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true);
  });
  it("leaves real bugs alone", () => {
    expect(isReloadableError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isReloadableError(new Error("Office workload failed"))).toBe(false);
    expect(isReloadableError(null)).toBe(false);
  });
});

describe("shouldAutoReload", () => {
  it("reloads the first time and not again within 30 seconds", () => {
    expect(shouldAutoReload(null, 100_000)).toBe(true);
    expect(shouldAutoReload("90000", 100_000)).toBe(false);
    expect(shouldAutoReload("60000", 100_000)).toBe(true);
    expect(shouldAutoReload("junk", 100_000)).toBe(true);
  });
});
