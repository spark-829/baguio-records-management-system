"use client";

import { CONF_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { useT } from "@/lib/i18n/client";
import type { Confidentiality, Priority, Status } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  const t = useT();
  return <span className={`badge ${STATUS_TONE[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useT();
  if (priority === "normal") return null;
  const tone = priority === "urgent" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600";
  return <span className={`badge ${tone}`}>{t(PRIORITY_LABEL[priority])}</span>;
}

export function ConfBadge({ level }: { level: Confidentiality }) {
  const t = useT();
  if (level !== "confidential") return null;
  return <span className="badge bg-rose-100 text-rose-800">{t(CONF_LABEL[level])}</span>;
}

export function OverdueBadge() {
  const t = useT();
  return <span className="badge bg-red-600 text-white">{t("Overdue")}</span>;
}
