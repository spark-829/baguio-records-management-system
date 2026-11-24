import { manilaDay } from "./arta";

export const COMPLAINT_TYPE = "Complaint";
export const REPLY_HOURS = 72;

export const CHANNELS = [
  { key: "OPACD online portal", href: "http://opacd.baguio.gov.ph/", address: "opacd.baguio.gov.ph" },
  { key: "PACD email", href: "mailto:pacd.baguiogovph@gmail.com", address: "pacd.baguiogovph@gmail.com" },
  { key: "Hotline 8888", href: "tel:8888", address: "8888" },
  { key: "Anti-Red Tape Authority", href: "mailto:complaints@arta.gov.ph", address: "complaints@arta.gov.ph" },
] as const;

export const isComplaint = (docTypeName: string | null | undefined) => docTypeName === COMPLAINT_TYPE;

export const replyDueAt = (createdAtIso: string): Date => new Date(new Date(createdAtIso).getTime() + REPLY_HOURS * 3600_000);

export type ReplyClock = { kind: "replied" } | { kind: "left"; hours: number } | { kind: "late"; hours: number };

export function replyClock(a: { createdAt: string; now: Date; replied: boolean }): ReplyClock {
  if (a.replied) return { kind: "replied" };
  const ms = replyDueAt(a.createdAt).getTime() - a.now.getTime();
  if (ms >= 0) return { kind: "left", hours: Math.max(1, Math.ceil(ms / 3600_000)) };
  return { kind: "late", hours: Math.max(1, Math.floor(-ms / 3600_000)) };
}

/** Manila YYYY-MM-DD of the reply deadline. */
export const complaintDueDate = (createdAtIso: string): string => manilaDay(replyDueAt(createdAtIso));
