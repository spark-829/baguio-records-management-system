import { describe, expect, it } from "vitest";
import { emlToFields, looksLikeEml, parseEml, pickAttachments } from "../src/lib/eml";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const subject = "=?UTF-8?B?" + b64("Permit request for Café") + "?=";
const pdf = b64("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const eml = [
  'From: "Maria Santos" <maria@example.org>',
  "To: records@baguio.gov.ph",
  `Subject: ${subject}`,
  "Date: Mon, 23 Nov 2026 23:30:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="BND"',
  "",
  "--BND",
  'Content-Type: text/plain; charset="utf-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Good day,=0A=0APlease see the attached letter. Caf=C3=A9 permit.",
  "--BND",
  'Content-Type: application/pdf; name="letter.pdf"',
  'Content-Disposition: attachment; filename="letter.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  pdf,
  "--BND--",
  "",
].join("\r\n");

describe("parseEml + emlToFields", () => {
  it("decodes subject, sender, Manila date and body", async () => {
    const buf = new TextEncoder().encode(eml).buffer as ArrayBuffer;
    const email = await parseEml(buf);
    const f = emlToFields(email);
    expect(f.subject).toBe("Permit request for Café");
    expect(f.sender_name).toBe("Maria Santos");
    expect(f.sender_org).toBe("example.org");
    expect(f.document_date).toBe("2026-11-24");
    expect(f.mode).toBe("email");
    expect(f.description).toContain("Please see the attached letter. Café permit.");
    expect(email.attachments?.length).toBe(1);
    expect(pickAttachments(email.attachments ?? []).kept.map((x) => x.name)).toEqual(["letter.pdf"]);
  });
  it("strips HTML and gives an empty date for a bad one", () => {
    const f = emlToFields({ subject: "x", date: "nope", html: "<p>Hello <b>there</b></p><script>alert(1)</script>" });
    expect(f.description).toBe("Hello there");
    expect(f.document_date).toBe("");
  });
});

describe("pickAttachments", () => {
  const buf = (n: number) => new ArrayBuffer(n);
  it("skips unsupported types and over-size files", () => {
    const r = pickAttachments(
      [
        { filename: "a.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: buf(10) },
        { filename: "b.pdf", mimeType: "application/pdf", content: buf(600) },
        { filename: "c.png", mimeType: "", content: buf(600) },
        { filename: "d.jpg", mimeType: "image/jpeg", content: buf(600) },
      ],
      1500,
    );
    expect(r.kept.map((f) => f.name)).toEqual(["b.pdf", "c.png"]);
    expect(r.skipped).toEqual([
      { name: "a.docx", reason: "type" },
      { name: "d.jpg", reason: "size" },
    ]);
  });
});

describe("looksLikeEml", () => {
  it("is false for a PDF header and plain text", () => {
    expect(looksLikeEml("%PDF-1.7\n%âãÏÓ\n1 0 obj")).toBe(false);
    expect(looksLikeEml("Dear sir,\nPlease find this letter.")).toBe(false);
  });
  it("is true for an email", () => {
    expect(looksLikeEml(eml)).toBe(true);
  });
});
