import { describe, expect, it } from "vitest";
import { INLINE_NAV_MAX, inlineNav, isActive } from "../src/lib/nav";

describe("isActive", () => {
  it("matches / only on the exact path", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/records", "/")).toBe(false);
  });

  it("marks Records active on the list and on a record, but not on /records/new", () => {
    expect(isActive("/records", "/records")).toBe(true);
    expect(isActive("/records/abc", "/records")).toBe(true);
    expect(isActive("/records/new", "/records")).toBe(false);
  });

  it("marks Register active on itself", () => {
    expect(isActive("/records/new", "/records/new")).toBe(true);
    expect(isActive("/records", "/records/new")).toBe(false);
  });

  it("matches a prefix only at a slash", () => {
    expect(isActive("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActive("/admin/users", "/admin/users")).toBe(true);
    expect(isActive("/admin/users2", "/admin/users")).toBe(false);
    expect(isActive("/reports/satisfaction", "/reports")).toBe(true);
    expect(isActive("/reportsx", "/reports")).toBe(false);
  });
});

describe("inlineNav", () => {
  it("shows up to 6 links inline", () => {
    expect(INLINE_NAV_MAX).toBe(6);
    expect(inlineNav(6)).toBe(true);
    expect(inlineNav(1)).toBe(true);
    expect(inlineNav(0)).toBe(true);
  });

  it("folds 7 or more links into the Menu sheet", () => {
    expect(inlineNav(7)).toBe(false);
    expect(inlineNav(9)).toBe(false);
  });
});
