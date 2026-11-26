import { describe, expect, it } from "vitest";
import { DEMO_OFFICES, DEMO_START, demoAccountCount, demoEmailParam, demoHref } from "../src/lib/demo-accounts";

describe("demo accounts", () => {
  it("lists all 42 live demo accounts once per office", () => {
    expect(demoAccountCount()).toBe(42);
    const offices = DEMO_OFFICES.map((o) => o.office);
    expect(new Set(offices).size).toBe(offices.length);
  });
  it("start list accounts are all in the office list", () => {
    const all = new Set(DEMO_OFFICES.flatMap((o) => o.accounts.map((a) => a.email)));
    for (const d of DEMO_START) expect(all.has(d.email)).toBe(true);
  });
  it("accepts only demo addresses for prefill", () => {
    expect(demoEmailParam(" CCRO.Window@rms-demo.test ")).toBe("ccro.window@rms-demo.test");
    expect(demoEmailParam("someone@gmail.com")).toBe("");
    expect(demoEmailParam("<x>@rms-demo.test")).toBe("");
    expect(demoEmailParam(undefined)).toBe("");
  });
  it("builds a prefill link that keeps next", () => {
    expect(demoHref("sp.head@rms-demo.test", "")).toBe("/login?email=sp.head%40rms-demo.test#password");
    expect(demoHref("sp.head@rms-demo.test", "/records")).toBe("/login?email=sp.head%40rms-demo.test&next=%2Frecords#password");
  });
});
