export type AlertRow = {
  id: string;
  tracking_no: string;
  subject: string;
  status: string;
  due_date: string | null;
  to_receive: boolean;
  late: boolean;
};

export type Alerts = { count: number; to_receive: number; late: number; rows: AlertRow[] };

const num = (x: unknown) => Number(x) || 0;

export function parseAlerts(data: unknown): Alerts {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rows = Array.isArray(d.rows) ? (d.rows as Record<string, unknown>[]) : [];
  return {
    count: num(d.count),
    to_receive: num(d.to_receive),
    late: num(d.late),
    rows: rows
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        id: String(r.id ?? ""),
        tracking_no: String(r.tracking_no ?? ""),
        subject: String(r.subject ?? ""),
        status: String(r.status ?? ""),
        due_date: typeof r.due_date === "string" ? r.due_date : null,
        to_receive: r.to_receive === true,
        late: r.late === true,
      })),
  };
}

/** Badge text like GitHub or Facebook: nothing for 0, "99+" above 99. */
export function badgeText(n: number): string {
  return n <= 0 ? "" : n > 99 ? "99+" : String(n);
}
