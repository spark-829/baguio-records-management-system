import { describe, expect, it } from "vitest";
import { toneOf } from "../src/lib/due";

describe("calendar dot colors", () => {
  const today = "2026-11-21";
  it("red when the due date has passed", () => expect(toneOf("2026-11-20", today)).toBe("late"));
  it("amber from today up to 7 days ahead", () => {
    expect(toneOf("2026-11-21", today)).toBe("soon");
    expect(toneOf("2026-11-28", today)).toBe("soon");
  });
  it("green after 7 days, also across a month end", () => {
    expect(toneOf("2026-11-29", today)).toBe("ok");
    expect(toneOf("2026-12-03", today)).toBe("ok");
  });
});
