import { CONF_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import type { Confidentiality, Priority, Status } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  const tone = priority === "urgent" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600";
  return <span className={`badge ${tone}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function ConfBadge({ level }: { level: Confidentiality }) {
  if (level !== "confidential") return null;
  return <span className="badge bg-rose-100 text-rose-800">{CONF_LABEL[level]}</span>;
}

export function OverdueBadge() {
  return <span className="badge bg-red-600 text-white">Overdue</span>;
}
