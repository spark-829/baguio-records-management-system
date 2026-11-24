import { describe, expect, it } from "vitest";
import { isTxType, txLabel } from "../src/lib/transaction-type";

describe("transaction type", () => {
  it("accepts only the three codes", () => {
    expect(isTxType("G2C")).toBe(true);
    expect(isTxType("G2G")).toBe(true);
    expect(isTxType("G2B")).toBe(true);
    expect(isTxType("x")).toBe(false);
    expect(isTxType(null)).toBe(false);
  });
  it("labels", () => {
    expect(txLabel("G2G")).toBe("Government office (G2G)");
    expect(txLabel(null)).toBe("Not set");
    expect(txLabel("none")).toBe("Not set");
  });
});
