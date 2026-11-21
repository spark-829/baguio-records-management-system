import Link from "next/link";
import { Fragment } from "react";
import { getProfile, getSettings, isCentral } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

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
          {me.role !== "staff" && <TopicLink id="reports" title={t("Reports and totals")} />}
          <TopicLink id="ask" title={t("Ask the assistant")} />
          <TopicLink id="language" title={t("Change the language")} />
          <TopicLink id="bigger" title={t("Make the words bigger")} />
          <TopicLink id="safe" title={t("Signing out and keeping records safe")} />
        </ul>
      </nav>

      {central && (
        <Topic id="log" title={t("Log a letter that just arrived")}>
          {S("Click [[Register]] at the top of the screen.")}
          {S("No scan? Skip part 1. Go straight to the form.")}
          {S("Fill in the boxes marked with a red <req>. The other boxes are optional.")}
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
          {S("Fill in the boxes marked with a red <req>.")}
          {S("Choose the office under _Send to office_ if it goes to another City office.")}
          {S("Press [[Save and get tracking number]], then write the tracking number on the paper.")}
        </Topic>
      )}

      <Topic id="find" title={t("Find a document")}>
        {S("Click [[Records]] at the top.")}
        {S("Type a word from the subject (for example _drainage_) or the tracking number (for example _IN-2026-0001_).")}
        {S("Press [[Search]]. Click the subject to open it.")}
        {S("You can also type a whole sentence in _Ask in your own words_, such as “road repair letters from last week”.")}
      </Topic>

      <Topic id="where" title={t("See where a document is now")}>
        {S("Open the document.")}
        {S("The box at the top says _Now with_ (the office that has it), _What needs to be done_, and the _Due_ date.")}
        {S("The _History_ list shows every office that had it, with names, dates and notes. The newest is on top.")}
      </Topic>

      {me.role !== "viewer" && (
        <Topic id="act" title={t("Add a note or send it to another office")}>
          {S("Open the document.")}
          {S("Press [[Add a note or send to another office]] on the right.")}
          {S("Choose what you want to do. To return it to the office that sent it, choose _Send back to …_.")}
          {S("Write a short note if needed.")}
          {S("Press [[Save]]. The system asks you to confirm. Press [[Yes, save it]], or [[No, go back]].")}
        </Topic>
      )}

      <Topic id="late" title={t("See what is late")}>
        {S("Click [[Dashboard]].")}
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

      {me.role !== "staff" && (
        <Topic id="reports" title={t("Reports and totals")}>
          {S("Click [[Reports]] at the top.")}
          {S("To see one period only, choose the _From_ and _To_ dates, then press [[Apply]].")}
          {S("Press [[Print report]] for a paper copy, or [[Download list (CSV, opens in Excel)]] to open it in Excel.")}
          {me.role !== "viewer" && S("_Office workload_ shows which offices have the most waiting and late documents.")}
        </Topic>
      )}

      <Topic id="ask" title={t("Ask the assistant")}>
        {S("Click [[Assistant]].")}
        {S("Type your question in English or Taglish, for example “Nasaan na po yung voucher para sa drainage?”, then press [[Send]].")}
        {S("It only looks at documents you are allowed to see. Click a tracking number in the answer to open that document.")}
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
      <a className="inline-block py-2 text-brand-700 underline" href={`#${id}`}>{title}</a>
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
