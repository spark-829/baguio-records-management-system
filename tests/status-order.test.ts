import { describe, expect, it } from "vitest";
import { STATUS_LABEL, STATUS_ORDER } from "../src/lib/labels";

describe("STATUS_ORDER", () => {
  it("is the workflow order", () => {
    expect([...STATUS_ORDER]).toEqual(["registered", "forwarded", "received", "under_action", "completed", "released", "archived"]);
  });
  it("covers every status once", () => {
    expect(new Set(STATUS_ORDER)).toEqual(new Set(Object.keys(STATUS_LABEL)));
    expect(new Set(STATUS_ORDER).size).toBe(STATUS_ORDER.length);
  });
  it("labels in order", () => {
    expect(STATUS_ORDER.map((s) => STATUS_LABEL[s])).toEqual(["Registered", "Forwarded", "Received", "Being worked on", "Completed", "Sent out", "Archived"]);
  });
});
