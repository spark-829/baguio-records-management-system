export type HealthBody = {
  ok: boolean;
  app: "up";
  db: "up" | "down";
  checkedAt: string;
};

/** Builds the /api/health response. Never include error details, versions or secrets. */
export function buildHealth(input: { dbOk: boolean; checkedAt: Date }): { status: 200 | 503; body: HealthBody } {
  return {
    status: input.dbOk ? 200 : 503,
    body: { ok: input.dbOk, app: "up", db: input.dbOk ? "up" : "down", checkedAt: input.checkedAt.toISOString() },
  };
}
