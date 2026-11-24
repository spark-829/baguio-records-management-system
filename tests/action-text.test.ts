import { describe, expect, it } from "vitest";
import { actionText, makeT } from "../src/lib/i18n/core";

const en = makeT("en");
const fil = makeT("fil");

describe("actionText", () => {
  const cases: [string, string][] = [
    ["Sent out by Registered mail (PHLPost), tracking RR123456789PH", "Sent out by Registered mail (PHLPost), tracking RR123456789PH"],
    ["Sent out by LBC", "Sent out by LBC"],
    ["Delivery recorded: received by Maria Santos on 26 Nov 2026", "Delivery recorded: received by Maria Santos on 26 Nov 2026"],
    ["Put in box CGSO-2026-012", "Put in box CGSO-2026-012"],
    ["Moved from box A-1 to B-2", "Moved from box A-1 to B-2"],
    ["Taken out of box A-1", "Taken out of box A-1"],
    ["Sent out", "Sent out"],
    ["Sent to City Engineering Office", "Sent to City Engineering Office"],
  ];
  it.each(cases)("English keeps %s", (text, out) => {
    expect(actionText(text, en)).toBe(out);
  });
  it("has Filipino lines for the new texts", () => {
    for (const [text] of cases.slice(0, 6)) expect(actionText(text, fil)).not.toBe(actionText(text, en));
  });
  it("keeps the details inside the Filipino text", () => {
    expect(actionText("Put in box CGSO-2026-012", fil)).toContain("CGSO-2026-012");
    expect(actionText("Sent out by Registered mail (PHLPost), tracking RR123456789PH", fil)).toContain("RR123456789PH");
  });
});
