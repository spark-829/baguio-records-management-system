import { describe, expect, it } from "vitest";
import { buildHealth } from "../src/lib/health";

const at = new Date("2026-11-23T10:00:00.000Z");

describe("buildHealth", () => {
  it("returns 200 when the database answers", () => {
    expect(buildHealth({ dbOk: true, checkedAt: at })).toEqual({
      status: 200,
      body: { ok: true, app: "up", db: "up", checkedAt: "2026-11-23T10:00:00.000Z" },
    });
  });
  it("returns 503 when the database does not answer", () => {
    const r = buildHealth({ dbOk: false, checkedAt: at });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, app: "up", db: "down" });
  });
});
