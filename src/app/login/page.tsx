import { LoginForm } from "./login-form";
import { PineMark, SiteFooter } from "@/components/brand";

const DEMO = [
  { email: "records@rms-demo.test", role: "Records Officer (City Mayor's Office)" },
  { email: "admin@rms-demo.test", role: "Administrator" },
  { email: "engineering.head@rms-demo.test", role: "Department Head, Engineering" },
  { email: "engineering.staff@rms-demo.test", role: "Staff, Engineering" },
  { email: "treasury.staff@rms-demo.test", role: "Staff, Treasury" },
  { email: "viewer@rms-demo.test", role: "Viewer, Planning (read-only)" },
];

const NOTICES: Record<string, string> = {
  "no-access": "This account has no active RMS profile. Ask an administrator for access.",
  locked: "This account is locked. Try again later or ask an administrator to unlock it.",
  idle: "You were signed out because the computer was not used for a while. This keeps records safe. Please sign in again.",
  "signed-out": "You have signed out safely.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-brand-800">
      <main className="on-dark flex flex-1 items-center justify-center border-t-4 border-gold-500 bg-[linear-gradient(160deg,var(--color-brand-900),var(--color-brand-700))] px-4 py-10">
        <div className="grid w-full max-w-5xl items-start gap-8 md:grid-cols-2">
          <div className="text-white">
            <div className="flex items-center gap-3">
              <PineMark className="h-12 w-12" />
              <span className="text-xl font-bold tracking-tight">Baguio RMS</span>
            </div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-brand-100">A demo for the City Government of Baguio</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Records Management System</h1>
            <p className="mt-3 text-lg text-brand-100">
              Register incoming and outgoing documents, route them between offices, see where each one is, and find it
              again in seconds.
            </p>
            <div className="mt-6 rounded-xl border border-white/20 bg-white/10 p-5 text-sm">
              <p className="font-semibold">Demo accounts (password: Demo@2026)</p>
              <ul className="mt-3 space-y-2">
                {DEMO.map((d) => (
                  <li key={d.email}>
                    <span className="font-mono text-sm break-all text-white">{d.email}</span>
                    <span className="text-brand-100"> · {d.role}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-sm text-brand-100">
              Portfolio demo built by{" "}
              <a href="/developer" className="font-semibold text-white underline">Vicson Yaris</a>. Not an official City Government
              system; all data is fictional.
            </p>
          </div>
          <div className="card order-first border-t-4 border-t-gold-500 p-6 text-ink sm:p-8 md:order-none">
            <h2 className="text-2xl font-bold">Sign in</h2>
            {error && NOTICES[error] && (
              <p
                role="status"
                className={`mt-3 rounded-lg border-l-4 p-3 text-sm ${error === "signed-out" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-amber-600 bg-amber-50 text-amber-900"}`}
              >
                {NOTICES[error]}
              </p>
            )}
            <LoginForm />
          </div>
        </div>
      </main>
      <SiteFooter className="" />
    </div>
  );
}
