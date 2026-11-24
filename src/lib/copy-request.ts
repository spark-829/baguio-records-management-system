import { parseReplyTo } from "./reply-to";

export const COPY_TYPE = "Request for copy";
export const CLO_CODE = "CLO";

export type CopyForm = {
  source_tracking_no: string;
  pages: number | null;
  fee_php: string | null;
  requester_kind: "owner" | "representative";
  id_checked: boolean;
  authorization_checked: boolean;
};

export const isCopyType = (name: string | null | undefined) => name === COPY_TYPE;

const val = (e: Record<string, FormDataEntryValue | null | undefined>, k: string) => {
  const v = e[k];
  return typeof v === "string" ? v.trim() : "";
};

export function parseCopyForm(entries: Record<string, FormDataEntryValue | null | undefined>): { ok: true; value: CopyForm } | { error: string } {
  const tn = parseReplyTo(val(entries, "copy_source"));
  if (!tn) return { error: "Type the tracking number of the record asked for, for example IN-2026-0001." };
  let pages: number | null = null;
  const p = val(entries, "copy_pages");
  if (p) {
    if (!/^\d{1,4}$/.test(p) || Number(p) < 1 || Number(p) > 5000) return { error: "Type the number of pages, from 1 to 5000." };
    pages = Number(p);
  }
  let fee: string | null = null;
  const f = val(entries, "copy_fee");
  if (f) {
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(f)) return { error: "Type the fee in pesos, for example 50 or 50.00." };
    fee = f;
  }
  const kind = val(entries, "copy_requester");
  if (kind !== "owner" && kind !== "representative") return { error: "Choose who is asking for the copy." };
  const authorization = val(entries, "copy_auth") === "on";
  if (kind === "representative" && !authorization) return { error: "Check the authorization letter or SPA for a representative." };
  return {
    ok: true,
    value: {
      source_tracking_no: tn,
      pages,
      fee_php: fee,
      requester_kind: kind,
      id_checked: val(entries, "copy_id") === "on",
      authorization_checked: kind === "representative" ? authorization : false,
    },
  };
}

export type DpoStatus = "not_needed" | "pending" | "approved" | "refused";
export type DpoTone = "amber" | "emerald" | "red" | "slate";

export function dpoTag(row: { dpo_status: DpoStatus; dpo_name?: string | null; dpo_at?: string | null }, fmt: (iso: string) => string = (s) => s): { label: string; tone: DpoTone; name?: string; date?: string } {
  switch (row.dpo_status) {
    case "pending":
      return { label: "Waiting for approval", tone: "amber" };
    case "approved":
      return { label: "Approved by {name}, {date}", tone: "emerald", name: row.dpo_name ?? "—", date: row.dpo_at ? fmt(row.dpo_at) : "—" };
    case "refused":
      return { label: "Refused", tone: "red" };
    default:
      return { label: "Not needed: not confidential", tone: "slate" };
  }
}

export function canDecide(a: { role: string; officeCode: string | null | undefined; status: string; dpoStatus: DpoStatus | null | undefined; currentOfficeCode?: string | null }): boolean {
  return (
    a.role === "dept_head" &&
    a.officeCode === CLO_CODE &&
    (a.currentOfficeCode === undefined || a.currentOfficeCode === CLO_CODE) &&
    (a.status === "received" || a.status === "under_action") &&
    a.dpoStatus === "pending"
  );
}

export function canRelease(a: {
  role: string;
  userOfficeId: string | null | undefined;
  currentOfficeId: string | null | undefined;
  status: string;
  dpoStatus: DpoStatus | null | undefined;
  releasedAt: string | null | undefined;
  deleted: boolean;
}): boolean {
  if (a.deleted || a.releasedAt) return false;
  const roleOk = a.role === "records_officer" || ((a.role === "dept_head" || a.role === "staff") && !!a.userOfficeId && a.userOfficeId === a.currentOfficeId);
  return roleOk && ["registered", "received", "under_action", "completed"].includes(a.status) && (a.dpoStatus === "not_needed" || a.dpoStatus === "approved");
}
