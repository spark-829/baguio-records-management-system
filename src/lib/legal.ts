/**
 * Terms of use and privacy notice for the sign-in page (/terms, /privacy).
 * Every sentence describes something the system really does today; keep it that way when features change.
 * Each string is a translation key (Filipino lines live in src/lib/i18n/fil.ts, checked by tests/legal.test.ts).
 */

import { MAX_UPLOAD_BYTES } from "./upload-policy";

export type LegalSection = { id: string; heading: string; paras: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string[]; sections: LegalSection[] };

/** Last change to either text, shown under the title (ISO date). */
export const LEGAL_UPDATED = "2026-11-26";

/** Default security settings (rms_settings rows from migrations 20261120000400 and 20261126000200, upload-policy.ts). */
export const LEGAL_VARS = { tries: 5, lockMinutes: 15, idleMinutes: 15, maxHours: 12, maxMb: MAX_UPLOAD_BYTES / (1024 * 1024) };

/** Demo address of the City's Data Protection Officer; same as DPO_CONTACT in components/privacy-notice.tsx. */
export const LEGAL_DPO = "dpo@rms-demo.test";

const DEMO_NOTE = "This is a portfolio demo, not an official City Government of Baguio service. All names and records in it are fictional.";

const AI_PARAS = [
  "In this demo, the assistant, record summaries and filling the form from a scanned letter use DeepSeek, an AI service outside the Philippines. It is used for this demo only: for real use, the City would switch to Claude or to an open-weight model run on the City's own servers.",
  "Names and contact details are removed before a record is summarized or used by the assistant, and confidential records are never sent. Reading a scanned letter to fill in the form sends that letter's text; tick Sensitive document to fill the form by hand instead.",
  "The assistant only looks at records you are allowed to see. Your conversation with it is kept only in your browser tab. It is not saved in the database, and it is wiped when you close the tab or return to the sign-in page.",
];

export const TERMS: LegalDoc = {
  title: "Terms of use",
  intro: [
    "These terms apply to everyone who signs in to the Baguio City Records Management System (RMS). By signing in, you agree to them.",
    DEMO_NOTE,
  ],
  sections: [
    {
      id: "who",
      heading: "Who may use the system",
      paras: [
        "Only City employees who were given an account by the administrator may sign in. Each person has their own account, and offices have one account per staff member.",
        "Never share your password or let someone else work under your name. Everything done under your account is recorded as done by you.",
      ],
    },
    {
      id: "roles",
      heading: "What you can do depends on your role",
      paras: ["Your role and your office decide which records you can see and what you can do with them. The database itself enforces these rules, not only the screens."],
      list: [
        "Administrator: manages accounts, offices, security settings and system analytics. Administrators do not register or act on records, and cannot open confidential records.",
        "Records Officer: registers incoming and outgoing records, sends them to offices and keeps track of paper boxes.",
        "Department Head: acts on records sent to the office, assigns them to staff and can open the office's confidential records.",
        "Department Staff: acts on records of their own office.",
        "Viewer: can read records but not change them. Some viewers are auditors who may also read the audit trail.",
      ],
    },
    {
      id: "official",
      heading: "Use records for official work only",
      paras: [
        "Open, download and share records only when your work needs it. Do not copy, post or disclose them outside the office.",
        "Do not try to get around the access rules, sign in as someone else, or upload files that are not part of an official record.",
      ],
    },
    {
      id: "logged",
      heading: "What the system records about your use",
      paras: [
        "Every sign-in, failed sign-in, sign-out, record you open and file you download is logged with your name, date, time and IP address.",
        "Every change to a record or a setting goes into an audit trail. Each entry is chained to the one before it, so a changed or deleted entry can be detected, and entries cannot be edited or deleted.",
        "Administrators and auditors can read these logs.",
      ],
    },
    {
      id: "signin",
      heading: "Sign-in safety",
      paras: [
        "After {tries} wrong passwords, the account locks for {lockMinutes} minutes. An administrator can unlock it sooner.",
        "If the computer is not used for {idleMinutes} minutes, the system signs you out by itself and warns you a minute before. A sign-in lasts at most {maxHours} hours.",
        "After you sign in, the system shows when and with which browser you last signed in, and tells you when this sign-in comes from a new device or network.",
        "You can turn on two-step sign-in with an authenticator app under My account. Always sign out when you leave your desk.",
        "These are the standard settings; the administrator can change them.",
      ],
    },
    {
      id: "files",
      heading: "Files and attachments",
      paras: [
        "Attached files are kept in private storage. They open only through the system, after it checks that you may see the record.",
        "Downloaded PDF files and photos are stamped with the name of the person who downloaded them and the date.",
        "Each file can be up to {maxMb} MB. Photos are made smaller before upload unless you choose to keep full quality, and the same file cannot be attached twice to one record.",
      ],
    },
    {
      id: "delete",
      heading: "Deleting records",
      paras: [
        "Records are not erased. A deleted record moves to the Deleted records bin, where an administrator can restore it, and the deletion is logged.",
        "Records are kept for the period set in the records retention schedule of the National Archives of the Philippines.",
      ],
    },
    {
      id: "ai",
      heading: "The AI assistant (demo only)",
      paras: [...AI_PARAS, "AI answers can be wrong. Check the record itself before you act on an answer. When the demo's AI budget is used up, the system shows demo suggestions instead."],
    },
    {
      id: "help",
      heading: "Help and changes",
      paras: [
        "For help with your account or a locked account, contact the administrator of the system. For a forgotten password, use Forgot password? on the sign-in page: the request goes to the administrator.",
        "How personal data is handled is explained in the privacy notice.",
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy notice",
  intro: [
    "How the Records Management System handles personal data, under the Data Privacy Act of 2012 (Republic Act No. 10173).",
    DEMO_NOTE,
  ],
  sections: [
    {
      id: "collect",
      heading: "What we collect",
      paras: [],
      list: [
        "About people who file or receive documents: name, organization, address or barangay, contact details, and the document itself.",
        "About employees who use the system: name, office, role, email, sign-in times, failed sign-ins, IP address, and the records and files they opened.",
        "On the public tracking page: the tracking number entered, with the time and network address, to stop misuse.",
        "When someone asks for password help: the email typed, with the time, network address and browser, so the administrator can check the request.",
        "The client satisfaction survey is anonymous unless the person chooses to write a name or contact details.",
      ],
    },
    {
      id: "why",
      heading: "Why we use it",
      paras: [
        "To register, send, act on and keep public records, as allowed by Republic Act No. 10173 (Data Privacy Act), Republic Act No. 11032 (Ease of Doing Business) and records laws.",
        "To keep the system secure and to show who did what to each record.",
      ],
    },
    {
      id: "see",
      heading: "Who can see it",
      paras: [
        "Only staff whose role and office allow it. The database enforces these rules for every request.",
        "Names in lists are shortened (like J*** dela C***). The full name shows only when a record is opened, and every opening is logged.",
        "Confidential records are open only to the office heads concerned, and they are never sent to the AI service.",
      ],
    },
    {
      id: "protect",
      heading: "How we protect it",
      list: [
        "The site is reached only over an encrypted (HTTPS) connection.",
        "Attached files are kept in private storage, and downloads are stamped with the name of the person who downloaded them.",
        "Accounts lock after repeated wrong passwords, and idle sign-ins end by themselves.",
        "The audit trail is chained so that a changed or deleted entry can be detected.",
        "Deleted records go to a bin first, so nothing is lost by mistake.",
      ],
      paras: [],
    },
    { id: "ai", heading: "AI service in this demo", paras: AI_PARAS },
    {
      id: "keep",
      heading: "How long we keep it",
      paras: [
        "Records are kept for the period set for their document type in the records retention schedule of the National Archives of the Philippines.",
        "Sign-in logs, access history and the audit trail are kept for audits.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      paras: [
        "You have the right to be informed, to access your data, to correct it, to object, to have it erased or blocked where the law allows, and to complain to the National Privacy Commission.",
        "On request, the City can list every time a record naming you was opened or downloaded, and by whom.",
        "Send requests and questions to the City's Data Protection Officer: {dpo}.",
      ],
    },
  ],
};

/** Every translation key used by the two texts (for the Filipino coverage test). */
export function legalStrings(): string[] {
  const out = new Set<string>();
  for (const doc of [TERMS, PRIVACY]) {
    out.add(doc.title);
    doc.intro.forEach((s) => out.add(s));
    for (const s of doc.sections) {
      out.add(s.heading);
      s.paras.forEach((p) => out.add(p));
      s.list?.forEach((p) => out.add(p));
    }
  }
  return [...out];
}
