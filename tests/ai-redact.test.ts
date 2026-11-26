import { describe, expect, it } from "vitest";
import { redactRecordForAi, redactText } from "../src/lib/ai-redact";

describe("redactText (QA-099)", () => {
  it("removes e-mails, phone numbers and ID numbers but keeps tracking numbers", () => {
    const t = redactText("Call 0917 123 4567 or (074) 442-1234, mail juan@example.com, TIN 123-456-789-000, see IN-2026-0037.");
    expect(t).toBe("Call [phone] or [phone], mail [email], TIN [number], see IN-2026-0037.");
  });
  it("replaces the named people, also by surname alone", () => {
    const t = redactText("Letter of Juan dela Cruz. Mr. Cruz asks for a permit.", [{ name: "Juan dela Cruz", label: "[sender]" }]);
    expect(t).toBe("Letter of [sender]. Mr. [sender] asks for a permit.");
  });
  it("returns null for empty input", () => {
    expect(redactText(null)).toBeNull();
    expect(redactText("")).toBeNull();
  });
});

describe("redactRecordForAi", () => {
  it("drops names and redacts free text, keeping organizations", () => {
    const r = redactRecordForAi({
      sender_name: "Maria Santos",
      sender_org: "Barangay Irisan",
      recipient_name: null,
      description: "Maria Santos (09171234567) requests repair.",
      content_text: "Signed, Maria Santos",
      subject: "Request of Maria Santos",
    });
    expect(r.sender_name).toBe("[sender]");
    expect(r.sender_org).toBe("Barangay Irisan");
    expect(r.recipient_name).toBeNull();
    expect(r.description).toBe("[sender] ([phone]) requests repair.");
    expect(r.content_text).toBe("Signed, [sender]");
    expect(r.subject).toBe("Request of [sender]");
  });
});
