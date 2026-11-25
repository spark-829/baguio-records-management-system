import { describe, expect, it } from "vitest";
import { suggestedPrompts, type PromptProfile } from "../src/lib/chat-prompts";

const base: PromptProfile = { role: "staff", officeCode: "CEO", hasOffice: true, windowIntake: false, hrmoCss: false };
const mentionsOffice = (l: string[]) => l.some((s) => /my office|opisina/i.test(s));

describe("suggestedPrompts", () => {
  it("always returns 4 prompts", () => {
    for (const role of ["admin", "records_officer", "dept_head", "staff", "viewer"] as const) {
      expect(suggestedPrompts({ ...base, role })).toHaveLength(4);
    }
    expect(suggestedPrompts({ ...base, windowIntake: true })).toHaveLength(4);
  });
  it("admin, viewer and users without an office never get office prompts", () => {
    expect(mentionsOffice(suggestedPrompts({ ...base, role: "admin", hasOffice: false }))).toBe(false);
    expect(mentionsOffice(suggestedPrompts({ ...base, role: "viewer" }))).toBe(false);
    expect(mentionsOffice(suggestedPrompts({ ...base, role: "staff", hasOffice: false }))).toBe(false);
    expect(mentionsOffice(suggestedPrompts({ ...base, role: "dept_head", hasOffice: false, windowIntake: true }))).toBe(false);
  });
  it("staff and heads get office prompts, staff wording differs", () => {
    const staff = suggestedPrompts(base);
    const head = suggestedPrompts({ ...base, role: "dept_head" });
    expect(staff[0]).toBe("What is waiting in my office?");
    expect(staff[2]).toBe("Which of our records are overdue?");
    expect(head[2]).toBe("Which records in my office are overdue?");
  });
  it("window clerks and HRMO CSS get the window set", () => {
    expect(suggestedPrompts({ ...base, windowIntake: true })[0]).toBe("What did we receive today?");
    expect(suggestedPrompts({ ...base, officeCode: "HRMO", hrmoCss: true })[0]).toBe("What did we receive today?");
  });
  it("records officer gets the records-office set", () => {
    expect(suggestedPrompts({ ...base, role: "records_officer" })[1]).toBe("What came in today?");
  });
});
