import { STATUS_LABEL } from "./labels";
import type { Status } from "./types";

export type RouteLookups = { tracking: Map<string, string>; offices: Map<string, string> };

/** Plain-language line for a routing row in the audit log. */
export function routeText(d: Record<string, unknown>, lk: RouteLookups): string {
  const status = STATUS_LABEL[d.status as Status] ?? String(d.status ?? "");
  const tn = lk.tracking.get(String(d.record_id ?? ""));
  const from = lk.offices.get(String(d.from_office_id ?? ""));
  const to = lk.offices.get(String(d.to_office_id ?? ""));
  const where = from && to && from !== to ? ` (${from} → ${to})` : to ? ` at ${to}` : "";
  const what = `${d.action_taken ?? ""}${d.remarks ? ` (“${d.remarks}”)` : ""}`;
  return `${tn ? `${tn} · ` : ""}${status}${where}: ${what}`;
}
