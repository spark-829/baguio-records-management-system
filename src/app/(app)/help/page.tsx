import Link from "next/link";
import { getProfile, getSettings, isCentral } from "@/lib/session";

export const metadata = { title: "Help" };

/** Plain-language help, written for staff who are new to computers. Short steps, one action each. */
export default async function HelpPage() {
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  const central = isCentral(me);
  return (
    <div className="max-w-3xl space-y-5 text-[1.0625rem] leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">Help: how to use the system</h1>
        <p className="text-slate-700">Paano gamitin. Pick what you want to do. Each step is one click or one box.</p>
      </div>

      <nav aria-label="Help topics" className="card p-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {central && <li><a className="inline-block py-2 text-brand-700 underline" href="#log">Log a letter that just arrived</a></li>}
          <li><a className="inline-block py-2 text-brand-700 underline" href="#find">Find a document</a></li>
          <li><a className="inline-block py-2 text-brand-700 underline" href="#where">See where a document is now</a></li>
          {me.role !== "viewer" && <li><a className="inline-block py-2 text-brand-700 underline" href="#act">Add a note or send it to another office</a></li>}
          <li><a className="inline-block py-2 text-brand-700 underline" href="#late">See what is late</a></li>
          <li><a className="inline-block py-2 text-brand-700 underline" href="#ask">Ask the assistant</a></li>
          <li><a className="inline-block py-2 text-brand-700 underline" href="#bigger">Make the words bigger</a></li>
          <li><a className="inline-block py-2 text-brand-700 underline" href="#safe">Signing out and keeping records safe</a></li>
        </ul>
      </nav>

      {central && (
        <Topic id="log" title="Log a letter that just arrived">
          <li>Click <Btn>Register</Btn> at the top of the screen.</li>
          <li>No scan? Skip part 1. Go straight to the form.</li>
          <li>Fill in the boxes marked with a red <span className="font-semibold text-red-700">*</span>. The other boxes are optional.</li>
          <li>To send it to an office right away, choose the office under <em>Send to office</em>.</li>
          <li>Press <Btn>Save and get tracking number</Btn>.</li>
          <li>Press <Btn>Print routing slip</Btn> and staple it to the paper.</li>
          <li>Changed your mind? Press <Btn>Cancel</Btn>. Nothing is saved.</li>
        </Topic>
      )}

      <Topic id="find" title="Find a document">
        <li>Click <Btn>Records</Btn> at the top.</li>
        <li>Type a word from the subject (for example <em>drainage</em>) or the tracking number (for example <em>IN-2026-0001</em>).</li>
        <li>Press <Btn>Search</Btn>. Click the subject to open it.</li>
        <li>You can also type a whole sentence in <em>Ask in your own words</em>, such as “road repair letters from last week”.</li>
      </Topic>

      <Topic id="where" title="See where a document is now">
        <li>Open the document.</li>
        <li>The box at the top says <em>Now with</em> (the office that has it), <em>What needs to be done</em>, and the <em>Due</em> date.</li>
        <li>The <em>History</em> list shows every office that had it, with names, dates and notes. The newest is on top.</li>
      </Topic>

      {me.role !== "viewer" && (
        <Topic id="act" title="Add a note or send it to another office">
          <li>Open the document.</li>
          <li>Press <Btn>Add a note or send to another office</Btn> on the right.</li>
          <li>Choose what you want to do. To return it to the office that sent it, choose <em>Send back to …</em>.</li>
          <li>Write a short note if needed.</li>
          <li>Press <Btn>Save</Btn>. The system asks you to confirm. Press <Btn>Yes, save it</Btn>, or <Btn>No, go back</Btn>.</li>
        </Topic>
      )}

      <Topic id="late" title="See what is late">
        <li>Click <Btn>Dashboard</Btn>.</li>
        <li>Click the red <em>Overdue</em> box. It lists every late document you are allowed to see.</li>
        <li>Further down, <em>Due in the next 7 days</em> lists what will be late soon, the nearest date first.</li>
      </Topic>

      <Topic id="ask" title="Ask the assistant">
        <li>Click <Btn>Assistant</Btn>.</li>
        <li>Type your question in English or Taglish, for example “Nasaan na po yung voucher para sa drainage?”, then press <Btn>Send</Btn>.</li>
        <li>It only looks at documents you are allowed to see. Click a tracking number in the answer to open that document.</li>
      </Topic>

      <Topic id="bigger" title="Make the words bigger">
        <li>Hold the <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5">Ctrl</kbd> key and press <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5">+</kbd>. Press it again for bigger.</li>
        <li>To go back to normal, hold <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5">Ctrl</kbd> and press <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5">0</kbd>.</li>
      </Topic>

      <Topic id="safe" title="Signing out and keeping records safe">
        <li>Press <Btn>Sign out</Btn> at the top right when you leave your desk.</li>
        <li>If the computer is not used for {settings.idleTimeoutMinutes} minutes, the system signs you out by itself. A big message appears a minute before. Press <Btn>Yes, keep me signed in</Btn> to stay.</li>
        <li>Names in lists are shortened (like “J*** dela C***”) for privacy. Open the document to see the full name.</li>
        <li>Every document you open is recorded with your name. Use records only for your work.</li>
      </Topic>

      <section className="card border-brand-600 bg-brand-50 p-4">
        <h2 className="font-semibold">Still stuck?</h2>
        <p className="mt-1">
          Ask the Records Section or the IT staff of your office. Tell them the tracking number and what you were trying to do.
          Nothing you do here can break the system, and every change can be traced and corrected.
        </p>
        <p className="mt-2">
          <Link href="/" className="btn-primary">Back to the dashboard</Link>
        </p>
      </section>
    </div>
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

function Btn({ children }: { children: React.ReactNode }) {
  return <strong className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold">{children}</strong>;
}
