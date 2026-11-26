import Link from "next/link";
import { Fragment } from "react";
import { getProfile, getSettings, isCentral } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { ComplaintChannels } from "@/components/complaint-channels";

export const metadata = { title: "Help" };

/**
 * Plain-language help, written for staff who are new to computers. Short steps, one action each.
 * Each step is one whole sentence so it translates well. Marks inside a step:
 * [[Button]] a button name, _words_ a screen label, <r>red</r> <o>orange</o> <g>green</g> colors, <k>Ctrl</k> a key, <req> the red star.
 */
export default async function HelpPage() {
  const [me, settings, { t }] = await Promise.all([getProfile(), getSettings(), getT()]);
  const central = isCentral(me);
  const S = (s: string, vars?: Record<string, string | number>) => <Step text={t(s, vars)} />;
  return (
    <div className="max-w-3xl space-y-5 text-[1.0625rem] leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">{t("Help: how to use the system")}</h1>
        <p className="text-slate-700">{t("Pick what you want to do. Each step is one click or one box.")}</p>
      </div>

      <nav aria-label={t("Help topics")} className="card p-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {central && <TopicLink id="log" title={t("Log a letter that just arrived")} />}
          {!central && me.role !== "viewer" && <TopicLink id="memo" title={t("Log a memo or letter your office sends")} />}
          <TopicLink id="find" title={t("Find a document")} />
          <TopicLink id="where" title={t("See where a document is now")} />
          {me.role !== "viewer" && <TopicLink id="act" title={t("Add a note or send it to another office")} />}
          <TopicLink id="late" title={t("See what is late")} />
          {me.role !== "viewer" && <TopicLink id="slip" title={t("Print a routing slip")} />}
          {me.role === "records_officer" && <TopicLink id="boxes" title={t("Keep track of paper in boxes")} />}
          {me.role !== "staff" && <TopicLink id="reports" title={t("Reports and totals")} />}
          <TopicLink id="complaints" title={t("Complaints and the survey")} />
          <TopicLink id="ask" title={t("Ask the assistant")} />
          <TopicLink id="language" title={t("Change the language")} />
          <TopicLink id="bigger" title={t("Make the words bigger")} />
          <TopicLink id="safe" title={t("Signing out and keeping records safe")} />
        </ul>
      </nav>

      {central && (
        <Topic id="log" title={t("Log a letter that just arrived")}>
          {S("Click [[Register]] at the top of the screen.")}
          {S("No file? Skip the box at the top and answer the questions.")}
          {S("Got a scan, a PDF or an email saved as .eml? Drop it in the box at the top or press [[Choose a file]]. Press [[Fill the form from this file]] and check what it filled in.")}
          {S("Fill in every box unless it says (optional).")}
          {S("Choose the _Transaction type_: citizen, government office or business.")}
          {S("Choose the _ARTA processing time_. The due date fills in by itself, counting only working days. You can still change it.")}
          {S("Choosing the _Document type_ Request for copy shows _About the copy_. A confidential copy is released only after the Data Privacy Officer approves.")}
          {S("To send it to an office right away, choose the office under _Send to office_.")}
          {S("Press [[Save and get tracking number]].")}
          {S("Press [[Print routing slip]] and staple it to the paper.")}
          {S("Changed your mind? Press [[Cancel]]. Nothing is saved.")}
        </Topic>
      )}

      {!central && me.role !== "viewer" && (
        <Topic id="memo" title={t("Log a memo or letter your office sends")}>
          {S("Click [[Register]] at the top.")}
          {S("It is already set to _Outgoing_. Letters that arrive from outside are logged by the Records Section, not here.")}
          {S("Fill in every box unless it says (optional).")}
          {S("Choose the office under _Send to office_ if it goes to another City office.")}
          {S("Answering a letter? Open it and press [[Write a reply]], or type its tracking number under _In reply to_.")}
          {S("Press [[Save and get tracking number]], then write the tracking number on the paper.")}
        </Topic>
      )}

      <Topic id="find" title={t("Find a document")}>
        {S("Click [[Records]] at the top.")}
        {S("Type a word from the subject (for example _drainage_) or the tracking number (for example _IN-2026-0001_).")}
        {S("Press [[Search]]. Click the subject to open it.")}
        {S("To see only citizen, government or business documents, press one of the buttons under the search box.")}
        {S("You can also type a whole sentence in the search box and press [[Ask the assistant to find it]], such as “road repair letters from last week”.")}
      </Topic>

      <Topic id="where" title={t("See where a document is now")}>
        {S("Open the document.")}
        {S("The box at the top says _Now with_ (the office that has it), _What needs to be done_, and the _Due_ date.")}
        {S("The _History and notes_ list shows every office that had it, with names, dates and notes. The oldest is on top; a long list folds the middle steps.")}
      </Topic>

      {me.role !== "viewer" && (
        <Topic id="act" title={t("Add a note or send it to another office")}>
          {S("Open the document.")}
          {S("The _Actions_ box has one button for each thing you can do, such as [[Mark as received]], [[Send to another office]] or [[Mark as done]]. Less common ones are under _More actions_.")}
          {S("Press the button for what you want to do. To return it to the office that sent it, press _Send back to …_. To add a note only, type it under _History and notes_ and press [[Add note]].")}
          {S("Write a short note if needed.")}
          {S("Press [[Save]]. The system asks you to confirm. Press [[Yes, save it]], or [[No, go back]].")}
          {S("For a document your office sends out, press [[Mark as sent out]], then choose how it was sent. For registered mail or a courier, type the tracking number from the receipt. When it arrives, press [[Record delivery]] on the _Sending_ card and type who received it.")}
          {S("Office heads: to give the work to a staff member, open _Assign a person_ in the _Actions_ box, choose the person and press [[Assign]]. Staff see it under _Assigned to me_ on the Dashboard.")}
        </Topic>
      )}

      <Topic id="late" title={t("See what is late")}>
        {S("Click [[Dashboard]].")}
        {S("The bell at the top shows how many records were sent to your office or are late. Click it to see them.")}
        {S("Click the red _Overdue_ box. It lists every late document you are allowed to see.")}
        {S("Further down, _Due in the next 7 days_ lists what will be late soon, the nearest date first.")}
        {S("The _Due dates calendar_ puts a dot above each date for every record due that day: <r>red</r> is late, <o>orange</o> is due within 7 days, <g>green</g> is on track. Tap a date to see what is due that day.")}
      </Topic>

      {me.role !== "viewer" && (
        <Topic id="slip" title={t("Print a routing slip")}>
          {S("Open the document.")}
          {S("Press [[Print routing slip]] near the top.")}
          {S("Press [[Print]]. The slip fits on one page and already lists the steps done so far.")}
          {S("Staple it to the paper. Each office writes its action and signs in the next empty row.")}
        </Topic>
      )}

      {me.role === "records_officer" && (
        <Topic id="boxes" title={t("Keep track of paper in boxes")}>
          {S("Click [[Boxes]] at the top, then [[Add a box]]. Type the room and shelf, and what is inside, then press [[Save box]].")}
          {S("On the box page, press [[Print label]] and stick the label on the box. The QR code opens the box page.")}
          {S("To file a paper copy, open the record and press [[Put in a box]] under _Details_. Type the code on the box label and confirm.")}
          {S("To find the records in a box, open the box page, or type the box code in the _Box code_ filter on [[Records]].")}
        </Topic>
      )}

      {me.role !== "staff" && (
        <Topic id="reports" title={t("Reports and totals")}>
          {S("Click [[Reports]] at the top.")}
          {S("The _By transaction type_ chart counts citizen, government and business documents. Older records show as _Not set_.")}
          {S("To see one period only, choose the _From_ and _To_ dates, then press [[Apply]].")}
          {S("Press [[Print report]] for a paper copy, or [[Download list (CSV, opens in Excel)]] to open it in Excel.")}
          {me.role !== "viewer" && S("_Office workload_ shows which offices have the most waiting and late documents.")}
          {(me.role === "records_officer" || me.role === "dept_head") && S("Press [[Released documents logbook]] to see what was sent out on one day. Press [[Print logbook]] for the signing sheet, or [[Download CSV]] for Excel.")}
          {me.role === "records_officer" && S("Press [[Standard time per step]] to set how many minutes each step should take. Slower steps show _Slow_ in the record history.")}
        </Topic>
      )}

      <Topic id="complaints" title={t("Complaints and the survey")}>
        {S("To log a complaint, press [[Register]] and choose the _Document type_ Complaint. The reply is due in 72 hours, and the _Due_ box counts the hours.")}
        {S("The receipt has a second code, _Rate our service_. The citizen scans it to answer a short survey without giving a name.")}
        {me.role !== "staff" && me.role !== "viewer" && S("Open [[Reports]], then [[Client satisfaction]], to see the answers by month and print them for the City Human Resource Management Office.")}
        <li className="list-none"><ComplaintChannels /></li>
      </Topic>

      <Topic id="ask" title={t("Ask the assistant")}>
        {S("Click [[Assistant]].")}
        {S("Type your question in English or Taglish, for example “Nasaan na po yung voucher para sa drainage?”, then press [[Send]].")}
        {S("It only looks at documents you are allowed to see. Click a tracking number in the answer to open that document.")}
        {S("For this demo, the assistant and [[Fill the form from this file]] use DeepSeek, an AI service outside the Philippines. Confidential records are kept out of it. For a sensitive scan, tick [[Sensitive document: do not send it to the AI]].")}
        {S("For real use in the City, this would switch to Claude or to an open-weight model run on the City's own servers.")}
      </Topic>

      <Topic id="language" title={t("Change the language")}>
        {S("At the top of the screen, press [[English]] or [[Filipino]].")}
        {S("The system remembers your choice on this computer or phone.")}
      </Topic>

      <Topic id="bigger" title={t("Make the words bigger")}>
        {S("Hold the <k>Ctrl</k> key and press <k>+</k>. Press it again for bigger.")}
        {S("To go back to normal, hold <k>Ctrl</k> and press <k>0</k>.")}
      </Topic>

      <Topic id="safe" title={t("Signing out and keeping records safe")}>
        {S("Press [[Sign out]] at the top right when you leave your desk.")}
        {S("If the computer is not used for {n} minutes, the system signs you out by itself. A big message appears a minute before. Press [[Yes, keep me signed in]] to stay.", { n: settings.idleTimeoutMinutes })}
        {S("Names in lists are shortened (like “J*** dela C***”) for privacy. Open the document to see the full name.")}
        {S("Every document you open is recorded with your name. Use records only for your work.")}
      </Topic>

      <section className="card border-brand-600 bg-brand-50 p-4">
        <h2 className="font-semibold">{t("Still stuck?")}</h2>
        <p className="mt-1">
          {t("Ask the Records Section or the IT staff of your office. Tell them the tracking number and what you were trying to do. Nothing you do here can break the system, and every change can be traced and corrected.")}
        </p>
        <p className="mt-2">
          <Link href="/" className="btn-primary">{t("Back to the dashboard")}</Link>
        </p>
      </section>
    </div>
  );
}

function TopicLink({ id, title }: { id: string; title: string }) {
  return (
    <li>
      <a className="tap-link text-brand-700 underline" href={`#${id}`}>{title}</a>
    </li>
  );
}

function Topic({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 p-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-6">{children}</ol>
    </section>
  );
}

const KBD = "rounded border border-slate-300 bg-slate-50 px-1.5";
const TOKEN = /(\[\[[^\]]+\]\]|_[^_]+_|<r>[^<]+<\/r>|<o>[^<]+<\/o>|<g>[^<]+<\/g>|<k>[^<]+<\/k>|<req>)/g;

/** One help step, with its marks turned into buttons, labels, colors and keys. */
function Step({ text }: { text: string }) {
  return (
    <li>
      {text.split(TOKEN).map((part, i) => {
        if (part.startsWith("[[")) return <Btn key={i}>{part.slice(2, -2)}</Btn>;
        if (part === "<req>") return <span key={i} className="font-semibold text-red-700">*</span>;
        if (part.startsWith("<r>")) return <strong key={i} className="text-red-700">{part.slice(3, -4)}</strong>;
        if (part.startsWith("<o>")) return <strong key={i} className="text-amber-800">{part.slice(3, -4)}</strong>;
        if (part.startsWith("<g>")) return <strong key={i} className="text-emerald-800">{part.slice(3, -4)}</strong>;
        if (part.startsWith("<k>")) return <kbd key={i} className={KBD}>{part.slice(3, -4)}</kbd>;
        if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </li>
  );
}

function Btn({ children }: { children: React.ReactNode }) {
  return <strong className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold">{children}</strong>;
}
