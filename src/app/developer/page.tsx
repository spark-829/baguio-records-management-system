import Link from "next/link";
import { PineMark, SiteFooter } from "@/components/brand";

export const metadata = { title: "About the developer" };

const BUILT = [
  "Register incoming and outgoing documents with a tracking number, receipt and routing slip",
  "Route records between offices, with every action, remark and file kept in the history",
  "Search by tracking number, subject, sender, office or date, in plain English or Tagalog",
  "Due-date calendar, overdue lists, reports and CSV export",
  "Public tracking page so citizens can follow their own document",
  "Roles and access levels, audit log, access history, login lockout and MFA, soft delete and Data Privacy Act features",
];

const PROJECTS = [
  {
    name: "Social media ELT pipeline",
    what: "A daily pipeline for a Philippine record label's public YouTube, TikTok and Instagram data: 3,041 posts tracked, 44 SQL scripts, 17 Edge Functions, 17 scheduled jobs and a 7-page Power BI report.",
    stack: "Python, Supabase PostgreSQL, TypeScript, pg_cron, GitHub Actions, Power BI",
  },
  {
    name: "Solar-powered biogas monitoring (capstone, University of Baguio)",
    what: "ESP32 sensors stream readings to Firebase, and a Django web app shows the production data.",
    stack: "ESP32, MicroPython, Firebase, Django, Python",
  },
  {
    name: "Recruitment workflow automation (Pacificall)",
    what: "Replaced a manual applicant-tracking process with Power Apps and Power Automate on SharePoint, cutting manual processing time by about 40%.",
    stack: "Power Apps, Power Automate, SharePoint",
  },
];

const SKILLS: [string, string][] = [
  ["Web and code", "TypeScript, Next.js, React, Python, Django, PHP, Java, C++"],
  ["Data", "PostgreSQL / SQL, Supabase, row-level security, Firebase, REST APIs"],
  ["Tools", "Git, GitHub Actions, Cloudflare Workers, Power BI, Excel and VBA"],
  ["Automation", "Power Apps, Power Automate, SharePoint"],
];

/** Public page about the person who built this demo, with a downloadable CV. */
export default function DeveloperPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-4 border-gold-500 bg-brand-800 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <PineMark className="h-10 w-10 text-gold-100" />
            <span>
              <span className="block text-lg font-bold">Baguio RMS</span>
              <span className="block text-sm text-brand-100">About the developer</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
        <section className="card border-t-4 border-t-gold-500 p-6 sm:p-8">
          <p className="text-sm font-semibold text-gold-800">Built by</p>
          <h1 className="mt-1 text-3xl font-bold">Vicson Yaris</h1>
          <p className="mt-1 text-lg text-slate-700">Computer Engineering graduate · Baguio City, Philippines</p>
          <p className="mt-4 text-lg">
            I build complete systems, from the database to the screen people use. I made this Records Management System to show how
            the City&apos;s document tracking could work: simple enough for every staff member, and safe enough for government records.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/Vicson-Yaris-CV.pdf" download className="btn-primary">
              Download my CV (PDF)
            </a>
            <a href="mailto:vicsonyaris29@gmail.com" className="btn-secondary">Email me</a>
          </div>
          <ul className="mt-5 grid gap-2 text-base sm:grid-cols-3">
            <li>
              <span className="block text-sm text-slate-600">Email</span>
              <a className="break-all font-medium text-brand-700 underline" href="mailto:vicsonyaris29@gmail.com">vicsonyaris29@gmail.com</a>
            </li>
            <li>
              <span className="block text-sm text-slate-600">GitHub</span>
              <a className="font-medium text-brand-700 underline" href="https://github.com/spark-829" target="_blank" rel="noopener noreferrer">spark-829</a>
            </li>
            <li>
              <span className="block text-sm text-slate-600">LinkedIn</span>
              <a className="font-medium text-brand-700 underline" href="https://www.linkedin.com/in/vicson-yaris-67a1b9160" target="_blank" rel="noopener noreferrer">Vicson Yaris</a>
            </li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold">What I built here</h2>
          <ul className="mt-3 space-y-2">
            {BUILT.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-700" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-slate-700">
            Built with Next.js, TypeScript and Supabase PostgreSQL, running on Cloudflare.{" "}
            <a className="font-medium text-brand-700 underline" href="https://github.com/spark-829/baguio-records-management-system" target="_blank" rel="noopener noreferrer">
              See the source code
            </a>
            .
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold">Other work</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {PROJECTS.map((p) => (
              <li key={p.name} className="py-3">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1">{p.what}</p>
                <p className="mt-1 text-sm text-slate-600">{p.stack}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="card p-6">
            <h2 className="text-xl font-bold">Experience</h2>
            <ul className="mt-3 space-y-3">
              <li>
                <h3 className="font-semibold">IEM Engineer · Philippine record label</h3>
                <p className="text-sm text-slate-600">2024 – present</p>
              </li>
              <li>
                <h3 className="font-semibold">Data Analyst Intern · Pacificall Incorporated Philippines</h3>
                <p className="text-sm text-slate-600">2025</p>
              </li>
            </ul>
            <h2 className="mt-6 text-xl font-bold">Education</h2>
            <ul className="mt-3 space-y-3">
              <li>
                <h3 className="font-semibold">BS Computer Engineering</h3>
                <p className="text-sm text-slate-600">University of Baguio · 2020 – 2026</p>
              </li>
              <li>
                <h3 className="font-semibold">Data Analytics Level III, top of the class</h3>
                <p className="text-sm text-slate-600">Northridge Institute of Business and Technology</p>
              </li>
            </ul>
          </section>
          <section className="card p-6">
            <h2 className="text-xl font-bold">Skills</h2>
            <dl className="mt-3 space-y-3">
              {SKILLS.map(([k, v]) => (
                <div key={k}>
                  <dt className="font-semibold">{k}</dt>
                  <dd className="text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <p className="text-center">
          <Link href="/" className="inline-block py-2 font-medium text-brand-700 underline">Back to the Records Management System</Link>
        </p>
      </main>
      <SiteFooter className="" />
    </div>
  );
}
