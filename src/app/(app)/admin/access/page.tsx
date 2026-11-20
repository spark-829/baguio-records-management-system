import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";

const EVENT_LABEL: Record<string, string> = {
  login_success: "Signed in",
  login_failed: "Failed sign-in",
  account_locked: "Account locked",
  locked_attempt: "Sign-in while locked",
  logout: "Signed out",
  idle_logout: "Signed out (inactive)",
  mfa_verified: "Two-step code accepted",
  view_record: "Opened record",
  download: "Downloaded file",
};
const ALERT = new Set(["login_failed", "account_locked", "locked_attempt"]);

type Row = {
  id: number;
  event: string;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  user: { full_name: string } | null;
  record: { id: string; tracking_no: string } | null;
};

type SP = { user?: string; record?: string; event?: string; person?: string; more?: string };

export default async function AccessHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();

  let recordId: string | null = null;
  if (sp.record) {
    const { data } = await supabase.from("rms_records").select("id").eq("tracking_no", sp.record.trim().toUpperCase()).maybeSingle();
    recordId = data?.id ?? "00000000-0000-0000-0000-000000000000";
  }
  let q = supabase
    .from("rms_access_log")
    .select("id, event, email, ip, user_agent, detail, created_at, user:rms_profiles(full_name), record:rms_records(id, tracking_no)")
    .order("created_at", { ascending: false })
    .limit(sp.more ? 500 : 50);
  if (sp.user) q = q.eq("user_id", sp.user);
  if (recordId) q = q.eq("record_id", recordId);
  if (sp.event) q = q.eq("event", sp.event);

  const [{ data }, { data: people }, report] = await Promise.all([
    q,
    supabase.from("rms_profiles").select("id, full_name").order("full_name"),
    sp.person ? supabase.rpc("rms_person_access_report", { p_person: sp.person }) : Promise.resolve(null),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Access history</h1>
        <p className="text-sm text-slate-600">Sign-ins, failed attempts, records opened and files downloaded, with IP address. Entries cannot be edited or deleted.</p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-2 p-3">
        <div>
          <label className="label" htmlFor="acc-user">User</label>
          <select id="acc-user" name="user" defaultValue={sp.user ?? ""} className="input w-56">
            <option value="">Everyone</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="acc-record">Record (tracking no.)</label>
          <input id="acc-record" name="record" defaultValue={sp.record ?? ""} className="input w-40 font-mono" placeholder="IN-2026-0001" />
        </div>
        <div>
          <label className="label" htmlFor="acc-event">Event</label>
          <select id="acc-event" name="event" defaultValue={sp.event ?? ""} className="input w-48">
            <option value="">All events</option>
            {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="btn-secondary">Filter</button>
        {(sp.user || sp.record || sp.event) && <Link href="/admin/access" className="text-sm text-brand-700 hover:underline">Clear</Link>}
      </form>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Record / file</th><th className="px-3 py-2">IP address</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={ALERT.has(r.event) ? "bg-red-50/60" : ""}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{r.user?.full_name ?? r.email ?? "—"}</td>
                <td className="px-3 py-2">
                  {EVENT_LABEL[r.event] ?? r.event}
                  {r.event === "login_failed" && r.detail?.attempt ? <span className="text-xs text-slate-500"> (attempt {String(r.detail.attempt)})</span> : null}
                </td>
                <td className="px-3 py-2">
                  {r.record ? <Link className="font-mono text-brand-700 hover:underline" href={`/records/${r.record.id}`}>{r.record.tracking_no}</Link> : "—"}
                  {r.detail?.file ? <span className="text-slate-600"> · {String(r.detail.file)}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600" title={r.user_agent ?? ""}>{r.ip || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No entries match.</td></tr>}
          </tbody>
        </table>
      </section>
      {!sp.more && (
        <p>
          <Link className="btn-secondary" href={`/admin/access?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), more: "1" } as Record<string, string>)}`}>
            Show older entries
          </Link>
        </p>
      )}

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="font-semibold">Who accessed this person&apos;s records?</h2>
          <p className="text-sm text-slate-600">
            For Data Privacy Act requests. Lists every time a record naming this person as sender or recipient was opened or downloaded.
          </p>
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <label htmlFor="acc-person" className="sr-only">Person&apos;s name</label>
          <input id="acc-person" name="person" defaultValue={sp.person ?? ""} className="input w-72" placeholder="e.g. Juan dela Cruz" minLength={3} required />
          <button className="btn-secondary">Run report</button>
        </form>
        {report?.error && <p className="text-sm text-red-700">{report.error.message}</p>}
        {report?.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">IP</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(report.data as { tracking_no: string; subject: string; record_id: string; event: string; accessed_by: string; ip: string | null; accessed_at: string }[]).map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.accessed_at)}</td>
                    <td className="px-3 py-2">{r.accessed_by}</td>
                    <td className="px-3 py-2">{EVENT_LABEL[r.event] ?? r.event}</td>
                    <td className="px-3 py-2"><Link className="font-mono text-brand-700 hover:underline" href={`/records/${r.record_id}`}>{r.tracking_no}</Link> <span className="text-slate-600">{r.subject}</span></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.ip || "—"}</td>
                  </tr>
                ))}
                {(report.data as unknown[]).length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">No access found for records naming “{sp.person}”.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
