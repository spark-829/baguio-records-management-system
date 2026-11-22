import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeResult } from "./ai-schemas";
import { searchRecords } from "./search";
import { STATUS_LABEL, partyLabel } from "./labels";
import type { SearchFilters } from "./types";

/**
 * Demo mode: used when no SPARK_DEEPSEEK_API key is set (or AI_DEMO_MODE=1).
 * Every AI feature keeps working with prepared or rule-based output, clearly labeled,
 * and still runs through the signed-in user's session, so access rules and audit logging are unchanged.
 * Adding the key switches to real DeepSeek with no code changes.
 */
export const DEMO_LABEL = "Practice version";

export function isAiDemo() {
  return process.env.AI_DEMO_MODE === "1" || !process.env.SPARK_DEEPSEEK_API;
}

/* ------------------------------ scan-to-prefill ------------------------------ */

type Sample = Omit<IntakeResult, "document_type" | "suggested_office_code" | "document_date"> & {
  document_type: string;
  office: string;
  daysAgo: number;
};

const SAMPLES: Sample[] = [
  {
    direction: "incoming",
    subject: "Request for repair of streetlights along Marcos Highway, Barangay Irisan",
    sender_name: "Maria Lopez",
    sender_org: "Barangay Irisan",
    recipient_name: null,
    recipient_org: "City Mayor's Office",
    document_type: "Letter",
    category: "Infrastructure",
    keywords: ["streetlight", "repair", "irisan", "marcos highway", "safety"],
    priority: "urgent",
    confidentiality: "public",
    office: "CEO",
    summary:
      "The Punong Barangay of Irisan asks the City to repair six broken streetlights along Marcos Highway, citing two road accidents at night this month.",
    extracted_text:
      "Republic of the Philippines\nBarangay Irisan, Baguio City\n\nHon. City Mayor\nCity Mayor's Office\nBaguio City\n\nDear Sir:\n\n" +
      "We respectfully request the repair of six (6) streetlights along Marcos Highway from Km 3 to Km 4 within Barangay Irisan. " +
      "The lights have been out for three weeks and two vehicular accidents were reported at night this month.\n\n" +
      "We hope for your immediate action on this matter for the safety of our residents and motorists.\n\n" +
      "Respectfully yours,\n\nMARIA LOPEZ\nPunong Barangay",
    daysAgo: 2,
  },
  {
    direction: "incoming",
    subject: "Invitation to the Baguio Day inter-office coordination meeting",
    sender_name: "Ramon Aquino",
    sender_org: "City Administrator's Office",
    recipient_name: null,
    recipient_org: "City Planning and Development Office",
    document_type: "Memorandum",
    category: "Events",
    keywords: ["baguio day", "coordination", "meeting", "invitation"],
    priority: "normal",
    confidentiality: "internal",
    office: "CPDO",
    summary:
      "The City Administrator's Office invites the planning office to a coordination meeting for the Baguio Day celebration and asks for one focal person.",
    extracted_text:
      "MEMORANDUM\n\nFOR: Heads of Offices\nFROM: City Administrator\nSUBJECT: Baguio Day Coordination Meeting\n\n" +
      "All offices are invited to a coordination meeting for the Baguio Day celebration at the City Hall Session Hall, 9:00 AM. " +
      "Please designate one (1) focal person and confirm attendance.\n\nRAMON AQUINO\nCity Administrator",
    daysAgo: 1,
  },
  {
    direction: "incoming",
    subject: "Request for certified true copy of building permit",
    sender_name: "Josefina Ramos",
    sender_org: null,
    recipient_name: null,
    recipient_org: "City Engineering Office",
    document_type: "Request / Complaint",
    category: "Permits",
    keywords: ["building permit", "certified true copy", "request"],
    priority: "normal",
    confidentiality: "internal",
    office: "CEO",
    summary:
      "A resident requests a certified true copy of the building permit for her house for a bank loan application.",
    extracted_text:
      "To the City Building Official\nCity Engineering Office\n\nI am requesting a certified true copy of the building permit issued for my residence " +
      "in Barangay Pacdal. I need it for a housing loan application. Attached is a copy of my ID.\n\nRespectfully,\nJOSEFINA RAMOS",
    daysAgo: 0,
  },
];

function pick<T>(items: T[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return items[h % items.length];
}

function isoDaysAgo(n: number) {
  const d = new Date(Date.now() - n * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
}

/** Returns one of three prepared sample letters (chosen from the file name), shaped exactly like the real AI result. */
export function demoIntake(fileName: string, docTypes: string[], offices: { code: string }[]): IntakeResult {
  const s = pick(SAMPLES, fileName);
  const docType = docTypes.find((t) => t.toLowerCase() === s.document_type.toLowerCase()) ?? docTypes[0];
  const office = offices.find((o) => o.code === s.office)?.code ?? offices[0]?.code ?? s.office;
  const { office: _o, daysAgo, ...rest } = s;
  void _o;
  return { ...rest, document_type: docType, suggested_office_code: office, document_date: isoDaysAgo(daysAgo) };
}

/* ---------------------------- plain-language search ---------------------------- */

const STOP = new Set(
  ("a an and any are about all also at be by can could did do does document documents file files find for from give have how i in is it " +
    "its me my now of on or record records show tell that the their them there these this to was we were what when where which who whom why " +
    "with you your please list made sent missing still need needs status today week month last days day ago this past since " +
    // Filipino / Taglish filler words, and words that mean "a document" without naming a type
    "kailan saan sino ano mga ng sa nasaan nasan na po yung iyong ang ba ko dito para may hawak sulat tungkol dokumento papeles " +
    "letter letters paper papers waiting pending desk sign signature " +
    // Words that only say "where" or "which", not what the record is about
    "office offices opisina galing many much number count ilan logged registered still yet not paid unpaid open " +
    "nandito andito dumating natanggap pa hindi should first work akin unahin uunahin gawin gagawin priority prioritize").split(" "),
);

const STATUS_WORDS: [RegExp, SearchFilters["status"]][] = [
  [/\barchived\b/, "archived"],
  [/\bcompleted?\b|\bdone\b|\bfinish(?:ed)?\b|\bnatapos\b|\btapos na\b/, "completed"],
  [/\breleased\b|\bsent out\b/, "released"],
  [/\bunder action\b|\bbeing acted\b|\bbeing worked on\b/, "under_action"],
  [/\bforwarded\b/, "forwarded"],
];

/** Filipino topic words to the English words used in the records ("kalsada" -> road). */
const TAGALOG: Record<string, string> = {
  kalsada: "road", daan: "road", tulay: "bridge", tubig: "water", ilaw: "streetlight", basura: "garbage",
  kanal: "drainage", baha: "flood", permiso: "permit", bayad: "payment", sahod: "salary", reklamo: "complaint",
  paaralan: "school", eskwela: "school", puno: "tree", palengke: "market", sunog: "fire",
};

export interface DemoFilters extends SearchFilters {
  explanation: string;
}

export function demoFilters(query: string, offices: { code: string; name: string }[], docTypes: string[], myOfficeCode?: string | null): DemoFilters {
  const lower = query.toLowerCase();
  const f: DemoFilters = { explanation: "" };
  const used = new Set<string>();
  const notes: string[] = [];

  const tracking = query.match(/\b(IN|OUT)-\d{4}-\d{4}\b/i);
  if (tracking) {
    f.q = tracking[0].toUpperCase();
    notes.push(`tracking number ${f.q}`);
    return { ...f, explanation: notes.join(", ") };
  }

  if (/\boverdue\b|\blate\b|\bpast due\b|\bdelayed\b/.test(lower)) {
    f.overdue = true;
    notes.push("overdue");
    ["overdue", "late", "past", "due", "delayed"].forEach((w) => used.add(w));
  }
  if (/\bincoming\b|\breceived from\b/.test(lower)) {
    f.direction = "incoming";
    notes.push("incoming");
    used.add("incoming");
  } else if (/\boutgoing\b|\bwe sent\b|\breplies\b/.test(lower)) {
    f.direction = "outgoing";
    notes.push("outgoing");
    ["outgoing", "replies"].forEach((w) => used.add(w));
  }
  for (const [re, status] of STATUS_WORDS) {
    if (re.test(lower)) {
      f.status = status;
      notes.push(`status "${STATUS_LABEL[status!]}"`);
      lower.match(re)![0].split(" ").forEach((w) => used.add(w));
      break;
    }
  }

  if (/\burgent\b|\brush\b|\bapurahan\b|\bmadalian\b/.test(lower)) {
    f.priority = "urgent";
    notes.push("urgent only");
    ["urgent", "rush", "apurahan", "madalian"].forEach((w) => used.add(w));
  }
  if (!f.status && /\bnot (?:yet )?paid\b|\bunpaid\b|\bstill\b|\bpending\b|\bwaiting\b|\bnaghihintay\b|\bhindi pa\b|\bopen\b/.test(lower)) {
    f.open = true;
    notes.push("still being handled");
  }

  // "my office", "on my desk", "opisina ko": the signed-in person's own office
  // "What should I work on first?": open records in my office now, soonest due first (sorted by the chat)
  const workList = /\bwork on\b|\bto do\b|\buunahin\b|\bgagawin\b|\bpriorit/.test(lower);
  const mine = (/\b(?:my office|my desk|on my desk|for me|opisina ko|sa amin|sa akin)\b/.test(lower) || workList) && myOfficeCode;
  if (mine) {
    f.office = myOfficeCode;
    // Only what is physically there now, not records the office sent away
    f.here = true;
    if (workList) f.open = true;
    notes.push(workList ? "open records in your office now" : "in your office now");
    ["office", "opisina", "amin"].forEach((w) => used.add(w));
  }

  // Office by code (CEO) or by a distinctive word of its name (engineering, treasury...)
  for (const o of mine ? [] : offices) {
    const words = o.name.toLowerCase().replace(/'s\b/g, "").split(/\W+/).filter((w) => w.length > 4 && !["office", "management"].includes(w));
    const alias = o.code === "CTO" ? ["treasury"] : o.code === "CMO" ? ["mayor"] : [];
    const hit = new RegExp(`\\b${o.code}\\b`).test(query) ? o.code.toLowerCase() : [...words, ...alias].find((w) => new RegExp(`\\b${w}`).test(lower));
    if (hit) {
      f.office = o.code;
      notes.push(o.name);
      used.add(hit);
      words.forEach((w) => used.add(w));
      break;
    }
  }

  // Document type: the full name, or a distinctive word ("voucher", "memo"), never a generic one like "request"
  const TYPE_WORDS: [RegExp, string][] = [
    [/\bvouchers?\b/, "voucher"],
    [/\bmemos?\b|\bmemorand/, "memorandum"],
    [/\bordinances?\b/, "ordinance"],
    [/\bresolutions?\b/, "resolution"],
    [/\bendorsements?\b/, "endorsement"],
    [/\bexecutive orders?\b/, "executive order"],
    [/\bpurchase requests?\b|\bprs?\b/, "purchase request"],
    [/\bcomplaints?\b/, "complaint"],
  ];
  for (const [re, word] of TYPE_WORDS) {
    const m = lower.match(re);
    const t = m && (docTypes.find((d) => d.toLowerCase() === word) ?? docTypes.find((d) => d.toLowerCase().includes(word)));
    if (m && t) {
      f.docType = t;
      notes.push(`type ${t}`);
      m[0].split(/\s+/).forEach((w) => used.add(w));
      break;
    }
  }

  // A capitalised name after from/by/of/for, e.g. "made by Juan dela Cruz", "from the Punong Barangay"
  const person = query.match(/\b(?:from|by|of|for|ni|kay|galing(?: sa)?|mula sa)\s+(?:the\s+)?((?:[A-Z][\w.'-]*)(?:\s+(?:dela|de|del|delos|de los|[A-Z][\w.'-]*))*)/);
  // "galing Treasury" names an office, not a person: the office filter above already covers it
  const officeWord = person && (f.office && used.has(person[1].toLowerCase()) || /^(treasury|mayor|engineering|budget|legal|planning|hrmo|personnel)$/i.test(person[1]));
  if (person && !officeWord && !/^(City|Baguio|The)$/.test(person[1])) {
    f.person = person[1].trim();
    notes.push(`person "${f.person}"`);
    f.person.toLowerCase().split(/\s+/).forEach((w) => used.add(w));
  }

  const today = new Date();
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  const days = lower.match(/\blast (\d{1,3}) days\b/);
  if (days) {
    f.from = iso(new Date(today.getTime() - Number(days[1]) * 864e5));
    notes.push(`last ${days[1]} days`);
  } else if (/\btoday\b/.test(lower) && !workList) {
    f.from = iso(today);
    notes.push("today");
  } else if (/\b(this|past) week\b/.test(lower)) {
    f.from = iso(new Date(today.getTime() - 7 * 864e5));
    notes.push("last 7 days");
  } else if (/\blast week\b|\bnoong isang linggo\b/.test(lower)) {
    // People say "last week" loosely, so look back two weeks rather than miss the record.
    f.from = iso(new Date(today.getTime() - 14 * 864e5));
    notes.push("last 2 weeks");
  } else if (/\bthis month\b/.test(lower)) {
    f.from = iso(today).slice(0, 8) + "01";
    notes.push("this month");
  } else if (/\blast month\b/.test(lower)) {
    f.from = iso(new Date(today.getTime() - 31 * 864e5));
    notes.push("last 31 days");
  }

  const rest = lower
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => TAGALOG[w] ?? w)
    .filter((w) => w.length > 2 && !STOP.has(w) && !used.has(w) && !/^\d+$/.test(w));
  if (rest.length) {
    f.q = rest.slice(0, 5).join(" ");
    notes.push(`about "${f.q}"`);
  }
  f.explanation = notes.length ? notes.join(", ") : "all records you can see";
  return f;
}

/* --------------------------------- summaries --------------------------------- */

/** "2026-11-24" -> "Nov 24, 2026", the same date style as the rest of the app. */
function niceDate(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(`${iso.slice(0, 10)}T12:00:00+08:00`));
}

const STATUS_TEXT: Record<string, string> = {
  registered: "registered and waiting to be routed",
  forwarded: "forwarded and waiting to be received",
  received: "received",
  under_action: "being worked on",
  completed: "done",
  released: "sent out",
  archived: "archived",
};

export function demoSummary(
  rec: {
    direction: string;
    subject: string;
    sender_name?: string | null;
    sender_org?: string | null;
    recipient_name?: string | null;
    recipient_org?: string | null;
    status: string;
    due_date?: string | null;
    current_office?: { name: string } | { name: string }[] | null;
  },
  routes: { status: string; action_taken: string | null; remarks: string | null }[],
) {
  const office = Array.isArray(rec.current_office) ? rec.current_office[0]?.name : rec.current_office?.name;
  const party =
    rec.direction === "incoming"
      ? [rec.sender_name, rec.sender_org].filter(Boolean).join(" of ")
      : [rec.recipient_name, rec.recipient_org].filter(Boolean).join(" of ");
  const last = [...routes].reverse().find((r) => r.action_taken || r.remarks);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const open = !["completed", "released", "archived"].includes(rec.status);
  const due = rec.due_date && open ? (rec.due_date < today ? ` It is overdue since ${niceDate(rec.due_date)}.` : ` It is due on ${niceDate(rec.due_date)}.`) : "";
  return (
    `${rec.direction === "incoming" ? "Incoming" : "Outgoing"} ${party ? `${rec.direction === "incoming" ? "from" : "to"} ${party} ` : ""}about ${rec.subject.charAt(0).toLowerCase()}${rec.subject.slice(1)}. ` +
    `It is ${STATUS_TEXT[rec.status] ?? rec.status}${office ? ` at the ${office}` : ""}.${due}` +
    (last ? ` Latest action: ${(last.action_taken ?? last.remarks ?? "").replace(/\.$/, "")}.` : "")
  );
}

/* ----------------------------------- chat ----------------------------------- */

/** Rule-based records assistant. Searches as the signed-in user, so it only ever sees what that user may see. */
export async function demoChat(
  supabase: SupabaseClient,
  question: string,
  excludeConfidential: boolean,
  myOfficeCode?: string | null,
): Promise<{ answer: string; records: { id: string; tracking_no: string }[] }> {
  const [{ data: offices }, { data: types }] = await Promise.all([
    supabase.from("rms_offices").select("code, name").eq("is_active", true),
    supabase.from("rms_document_types").select("name").eq("is_active", true),
  ]);
  // "Summarize IN-2026-0001" / "Pakisummarize" / "ibuod": answer with the record's summary, not a list
  const asked = question.match(/\b(IN|OUT)-\d{4}-\d{4}\b/i);
  if (asked && /summar|buod|explain|ipaliwanag|tell me about/i.test(question)) {
    const tn = asked[0].toUpperCase();
    const { data: rec } = await supabase
      .from("rms_records")
      .select("id, tracking_no, direction, subject, sender_name, sender_org, recipient_name, recipient_org, status, due_date, confidentiality, current_office:rms_offices!rms_records_current_office_id_fkey(name)")
      .eq("tracking_no", tn)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rec || (excludeConfidential && rec.confidentiality === "confidential")) {
      return { answer: `I could not find ${tn} among the records you may see${excludeConfidential ? " (confidential records are kept out of the assistant)" : ""}.`, records: [] };
    }
    const { data: steps } = await supabase.from("rms_routes").select("status, action_taken, remarks").eq("record_id", rec.id).order("created_at");
    return {
      answer: `Summary of [${rec.tracking_no}](/records/${rec.id}):\n${demoSummary({ ...rec, sender_name: null, recipient_name: null, sender_org: rec.sender_name || rec.sender_org ? partyLabel(rec.sender_name, rec.sender_org) : null, recipient_org: rec.recipient_name || rec.recipient_org ? partyLabel(rec.recipient_name, rec.recipient_org) : null }, steps ?? [])}`,
      records: [{ id: rec.id, tracking_no: rec.tracking_no }],
    };
  }
  const f = demoFilters(question, offices ?? [], (types ?? []).map((t) => t.name), myOfficeCode);
  const officeName = new Map((offices ?? []).map((o) => [o.code, o.name]));
  const { explanation, ...filters } = f;
  const counting = /\bhow many\b|\bilan\b|\bnumber of\b/i.test(question);
  const limit = counting ? 200 : 10;
  let rows = await searchRecords(supabase, filters, limit, excludeConfidential);
  let relaxed = false;
  const narrowed = filters.person || filters.office || filters.docType || filters.status || filters.overdue || filters.from || filters.priority || filters.direction;
  if (rows.length === 0 && filters.q && narrowed) {
    rows = await searchRecords(supabase, { ...filters, q: undefined }, limit, excludeConfidential);
    relaxed = rows.length > 0;
  }
  // "waiting", "pending", "on my desk": only records still being handled
  if (/\b(?:waiting|pending|on my desk|to sign|naghihintay)\b/i.test(question)) {
    rows = rows.filter((r) => !["completed", "released", "archived"].includes(r.status));
  }
  // Work list: soonest due first, then urgent ones
  if (filters.open && filters.here) {
    rows = [...rows].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || Number(b.priority === "urgent") - Number(a.priority === "urgent"));
  }
  const records = rows.map((r) => ({ id: r.id, tracking_no: r.tracking_no }));
  const head = `I searched the records you are allowed to see (${explanation}${relaxed ? `, ignoring the topic words` : ""}).`;
  if (rows.length === 0) {
    return {
      answer: `${head} Nothing matched. Try a person's name, an office, a topic like "drainage", or a tracking number like IN-2026-0001.${excludeConfidential ? " Confidential records are kept out of the assistant." : ""}`,
      records,
    };
  }
  const line = (r: (typeof rows)[number]) =>
    `- [${r.tracking_no}](/records/${r.id}) ${r.subject}: ${STATUS_TEXT[r.status] ?? r.status} at the ${officeName.get(r.current_office) ?? r.current_office}` +
    // Names are shortened here as in every list (Data Privacy Act); the record page shows them in full.
    (r.direction === "incoming" && (r.sender_name || r.sender_org)
      ? `, from ${partyLabel(r.sender_name, r.sender_org)}`
      : r.recipient_name || r.recipient_org
        ? `, to ${partyLabel(r.recipient_name, r.recipient_org)}`
        : "") +
    (r.created_by_name ? `, logged by ${r.created_by_name.split(" (")[0]}` : "");

  if (rows.length === 1) {
    const r = rows[0];
    const { data: routes } = await supabase
      .from("rms_routes")
      .select("status, action_taken, remarks, created_at")
      .eq("record_id", r.id)
      .order("created_at");
    const last = (routes ?? []).at(-1);
    return {
      answer:
        `${head} I found one record:\n${line(r)}` +
        (last ? `\nLatest step: ${last.action_taken ?? last.status}${last.remarks ? ` (“${last.remarks}”)` : ""}.` : "") +
        (r.due_date ? `\nDue date: ${niceDate(r.due_date)}.` : ""),
      records,
    };
  }
  if (counting) {
    const shown = rows.slice(0, 10);
    return {
      answer: `${head} There ${rows.length === 1 ? "is 1 record" : `are ${rows.length}${rows.length === 200 ? " or more" : ""} records`}.` +
        (rows.length > shown.length ? ` Here are the ${shown.length} newest:` : "") + `\n${shown.map(line).join("\n")}`,
      records: records.slice(0, 10),
    };
  }
  return { answer: `${head} I found ${rows.length} records:\n${rows.map(line).join("\n")}`, records };
}
