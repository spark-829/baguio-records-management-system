import type { Direction, Role, Status } from "./types";

export type ActionKind = "forward" | "receive" | "act" | "remark" | "complete" | "release" | "archive";

export interface ActionDef {
  kind: ActionKind;
  label: string;
  /** Status the record moves to. "remark" keeps the current status. */
  to: Status | "same";
  needsOffice?: boolean;
}

export const ACTIONS: Record<ActionKind, ActionDef> = {
  forward: { kind: "forward", label: "Send to another office", to: "forwarded", needsOffice: true },
  receive: { kind: "receive", label: "Mark as received (the paper is here)", to: "received" },
  act: { kind: "act", label: "Start working on it", to: "under_action" },
  remark: { kind: "remark", label: "Add a note", to: "same" },
  complete: { kind: "complete", label: "Mark as done", to: "completed" },
  release: { kind: "release", label: "Mark as sent out", to: "released" },
  archive: { kind: "archive", label: "File away (archive)", to: "archived" },
};

/** What the history says when no "what was done" text was typed: what happened, not the button's name. */
export function doneText(kind: ActionKind, toOfficeName?: string | null): string {
  switch (kind) {
    case "forward": return toOfficeName ? `Sent to ${toOfficeName}` : "Sent to another office";
    case "receive": return "Received";
    case "act": return "Work started";
    case "remark": return "Note added";
    case "complete": return "Done";
    case "release": return "Sent out";
    case "archive": return "Filed away (archived)";
  }
}

const BY_STATUS: Record<Status, ActionKind[]> = {
  registered: ["forward", "act", "remark", "complete", "release", "archive"],
  forwarded: ["receive", "remark"],
  received: ["act", "forward", "remark", "complete"],
  under_action: ["remark", "forward", "complete"],
  completed: ["release", "archive", "forward", "remark"],
  released: ["archive", "remark"],
  archived: [],
};

/** Actions a user may take on a record, given its state and the user's role and office. */
export function allowedActions(opts: {
  status: Status;
  direction: Direction;
  role: Role;
  userOfficeId: string | null;
  currentOfficeId: string;
}): ActionKind[] {
  const { status, direction, role, userOfficeId, currentOfficeId } = opts;
  if (role === "viewer") return [];
  const central = role === "admin" || role === "records_officer";
  const holdsIt = userOfficeId !== null && userOfficeId === currentOfficeId;
  if (!central && !holdsIt) return [];
  let actions = BY_STATUS[status];
  // Only outgoing letters are "sent out"; an incoming letter is answered with a new outgoing record.
  if (direction === "incoming") actions = actions.filter((a) => a !== "release");
  if (!central) actions = actions.filter((a) => a !== "archive");
  return actions;
}

export function nextStatus(current: Status, kind: ActionKind): Status {
  const to = ACTIONS[kind].to;
  return to === "same" ? current : to;
}

export function isOverdue(due: string | null, status: Status, today = new Date()) {
  if (!due) return false;
  if (status === "completed" || status === "released" || status === "archived") return false;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(today);
  return due < todayStr;
}

/** The record already sits received (or in progress) at an office this user acts for, so another "receive" changes nothing (QA-017). */
export function isAlreadyReceived(o: { status: Status; role: Role; userOfficeId: string | null; currentOfficeId: string }): boolean {
  if (o.status !== "received" && o.status !== "under_action") return false;
  if (o.role === "admin" || o.role === "records_officer") return true;
  return o.role !== "viewer" && o.userOfficeId !== null && o.userOfficeId === o.currentOfficeId;
}
