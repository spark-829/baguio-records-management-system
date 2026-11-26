import { describe, expect, it } from "vitest";
import { FIL } from "../src/lib/i18n/fil";
import { LEGAL_DPO, LEGAL_VARS, PRIVACY, TERMS, legalStrings } from "../src/lib/legal";
import { MAX_UPLOAD_BYTES } from "../src/lib/upload-policy";

/** Sign-in page strings added with the terms, help and accounts list (2026-11-26). */
const LOGIN_STRINGS = [
  "Please read and agree to the Terms of use and the Privacy notice before signing in.",
  "I have read and agree to the {terms} and the {privacy}, and I will use records for official work only.",
  "The links open in a new tab, so what you typed stays here.",
  "Every sign-in, record you open and file you download is logged with your name, date, time and IP address.",
  "Terms of use",
  "Privacy notice",
  "Need help signing in?",
  "Forgot your password, or is your account locked? Contact the administrator of the system for support.",
  "New staff member? Ask the administrator to make your own account. Accounts are never shared.",
  "After {n} wrong passwords the account locks for {m} minutes. Wait, or ask the administrator to unlock it.",
  "Filed a document and want to know where it is? You do not need an account.",
  "Good places to start",
  "Scroll down inside the list to see all {n} accounts.",
  "End of the list.",
  "Loading accounts…",
  "About the developer",
  "Developer",
  "Back to sign in",
  "Last updated {date}",
  "On this page",
];

describe("terms of use and privacy notice", () => {
  it("has a Filipino line for every sentence, keeping each placeholder", () => {
    for (const s of [...legalStrings(), ...LOGIN_STRINGS]) {
      expect(FIL[s], s).toBeTruthy();
      for (const ph of s.match(/\{\w+\}/g) ?? []) expect(FIL[s], `${s} keeps ${ph}`).toContain(ph);
    }
  });

  it("uses the real settings and contact", () => {
    expect(LEGAL_VARS.maxMb).toBe(MAX_UPLOAD_BYTES / (1024 * 1024));
    expect(LEGAL_DPO).toBe("dpo@rms-demo.test");
    const all = legalStrings().join(" ");
    for (const k of Object.keys(LEGAL_VARS)) if (all.includes(`{${k}}`)) expect(LEGAL_VARS).toHaveProperty(k);
    expect(all).toContain("{dpo}");
  });

  it("discloses DeepSeek as demo-only and the tab-only chat", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const text = doc.sections.flatMap((s) => [...s.paras, ...(s.list ?? [])]).join(" ");
      expect(text).toContain("DeepSeek");
      expect(text).toContain("for this demo only");
      expect(text).toContain("not saved in the database");
    }
  });

  it("gives every section a unique anchor", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
