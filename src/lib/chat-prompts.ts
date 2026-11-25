import { canWindowIntake, isHrmoCss } from "./office-features";
import { greetingName } from "./labels";
import type { Role } from "./types";

export type PromptProfile = {
  role: Role;
  officeCode?: string | null;
  hasOffice: boolean;
  windowIntake: boolean;
  hrmoCss: boolean;
};

const OFFICE_Q = "Ano ang naghihintay sa opisina namin?";

/** Four starter questions for the records assistant, chosen by role and office so each person sees ones that fit their work. English source strings (translated with t()). */
export function suggestedPrompts(p: PromptProfile): string[] {
  if (p.role === "admin") {
    return ["Which records are overdue?", "How many records were received this month?", "Which urgent records are still open?", "What came in today?"];
  }
  if (p.role === "records_officer") {
    return ["Which records are overdue?", "What came in today?", "How many records were received this week?", "Which urgent records are still open?"];
  }
  if (p.hasOffice && (p.windowIntake || p.hrmoCss)) {
    return ["What did we receive today?", "Which documents from this week are still pending?", "How many documents did we log today?", OFFICE_Q];
  }
  if (p.hasOffice && (p.role === "dept_head" || p.role === "staff")) {
    return [
      "What is waiting in my office?",
      "What should I work on first?",
      p.role === "staff" ? "Which of our records are overdue?" : "Which records in my office are overdue?",
      OFFICE_Q,
    ];
  }
  return ["Which records are overdue?", "What came in this week?", "Which urgent records are still open?", "How many records were received this month?"];
}

/** What the assistant shows a signed-in person: greeting, scope sentence (English, may hold {office}) and starter questions. */
export function assistantContext(me: { role: Role; full_name: string; window_intake?: boolean | null; office?: { code?: string | null; name?: string | null; features?: string[] | null } | null }) {
  const officeName = me.office?.name ?? "";
  const hasOffice = Boolean(me.office);
  const scope =
    me.role === "admin" || me.role === "records_officer"
      ? "I can look through every record in the system."
      : hasOffice && me.role !== "viewer"
        ? "I can look through the records the {office} can see."
        : "I can look through the records you may see.";
  const prompts = suggestedPrompts({
    role: me.role,
    officeCode: me.office?.code,
    hasOffice,
    windowIntake: canWindowIntake({ role: me.role, windowFlag: me.window_intake, features: me.office?.features }),
    hrmoCss: isHrmoCss({ role: me.role, officeCode: me.office?.code, windowFlag: me.window_intake }),
  });
  return { greeting: greetingName(me.full_name), scope, office: officeName, prompts };
}
