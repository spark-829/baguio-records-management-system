import type { TxType } from "./transaction-type";
export type Role = "admin" | "records_officer" | "dept_head" | "staff" | "viewer";
export type Direction = "incoming" | "outgoing";
export type Status =
  | "registered"
  | "forwarded"
  | "received"
  | "under_action"
  | "completed"
  | "released"
  | "archived";
export type Confidentiality = "public" | "internal" | "confidential";
export type Priority = "low" | "normal" | "urgent";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  office_id: string | null;
  is_active: boolean;
  locked_until?: string | null;
  /** Staff flagged as office window staff (null counts as false) */
  window_intake?: boolean | null;
  office?: { code: string; name: string; features?: string[] | null; ref_label?: string | null } | null;
}

export interface Office {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface DocType {
  id: string;
  name: string;
  retention_years: number;
}

export interface SearchRow {
  id: string;
  tracking_no: string;
  direction: Direction;
  subject: string;
  status: Status;
  priority: Priority;
  confidentiality: Confidentiality;
  document_type: string;
  current_office: string;
  origin_office: string;
  sender: string;
  recipient: string;
  created_by_name: string | null;
  created_at: string;
  due_date: string | null;
  ai_summary: string | null;
  rank: number;
  sender_name: string | null;
  sender_org: string | null;
  recipient_name: string | null;
  recipient_org: string | null;
  transaction_type: string | null;
  reference_no?: string | null;
  intake_window?: boolean | null;
}

export interface SearchFilters {
  q?: string;
  person?: string;
  direction?: Direction;
  status?: Status;
  office?: string;
  docType?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  /** Only records that are physically in `office` now (not ones it started) */
  here?: boolean;
  /** Only records still being handled */
  open?: boolean;
  priority?: Priority;
  tx?: TxType;
  /** Box code (rms_boxes.code) */
  box?: string;
  /** Received at an office window, or at the Records Section */
  at?: "window" | "desk";
}
