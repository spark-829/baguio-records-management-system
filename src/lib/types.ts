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
  office?: { code: string; name: string } | null;
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
}
