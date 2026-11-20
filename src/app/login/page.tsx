import { LoginForm } from "./login-form";

const DEMO = [
  { email: "records@rms-demo.test", role: "Records Officer (City Mayor's Office)" },
  { email: "admin@rms-demo.test", role: "Administrator" },
  { email: "engineering.head@rms-demo.test", role: "Department Head, Engineering" },
  { email: "engineering.staff@rms-demo.test", role: "Staff, Engineering" },
  { email: "treasury.staff@rms-demo.test", role: "Staff, Treasury" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-100">City Government of Baguio</p>
          <h1 className="mt-2 text-3xl font-bold">Records Management System</h1>
          <p className="mt-3 text-brand-100">
            Register incoming and outgoing documents, route them between offices, see where each one is, and find it
            again in seconds.
          </p>
          <div className="mt-6 rounded-xl bg-white/10 p-4 text-sm">
            <p className="font-semibold">Demo accounts (password: Demo@2026)</p>
            <ul className="mt-2 space-y-1">
              {DEMO.map((d) => (
                <li key={d.email}>
                  <span className="font-mono text-xs">{d.email}</span>
                  <span className="text-brand-100"> · {d.role}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-xs text-brand-100">
            Portfolio demo built by Vic. Not an official City Government system; all data is fictional.
          </p>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Sign in</h2>
          {error === "no-access" && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              This account has no active RMS profile. Ask an administrator for access.
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
