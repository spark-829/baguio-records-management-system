import { describe, expect, it } from "vitest";
import { collapseSteps, newestFirst } from "../src/lib/history";

describe("newestFirst", () => {
  it("sorts newest first without changing the input", () => {
    const input = [{ at: "2026-01-01T00:00:00Z" }, { at: "2026-03-01T00:00:00Z" }, { at: "2026-02-01T00:00:00Z" }];
    const copy = [...input];
    expect(newestFirst(input, (x) => x.at).map((x) => x.at)).toEqual([
      "2026-03-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ]);
    expect(input).toEqual(copy);
  });
});

describe("collapseSteps", () => {
  it("merges consecutive repeats at the same office", () => {
    const steps = [
      { status: "received", office: "CEO" },
      { status: "received", office: "CEO" },
    ];
    expect(collapseSteps(steps)).toEqual([steps[0]]);
  });

  it("keeps a forward to a different office", () => {
    const steps = [
      { status: "received", office: "CEO" },
      { status: "forwarded", office: "CTO" },
    ];
    expect(collapseSteps(steps)).toHaveLength(2);
  });

  it("keeps a later return to the same status after a change", () => {
    const steps = [
      { status: "received", office: "CEO" },
      { status: "forwarded", office: "CTO" },
      { status: "received", office: "CEO" },
    ];
    expect(collapseSteps(steps)).toHaveLength(3);
  });
});
