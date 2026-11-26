import Form from "next/form";
import { getT, pageTitle } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, canAudit } from "@/lib/session";
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

export const generateMetadata = pageTitle("Access history");

export default async function AccessHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, lang } = await getT();
  const me = await getProfile();
  if (!canAudit(me)) redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();

  let recordId: string | null = null;
  if (sp.record) {
    // An RPC, not a select: admins cannot select confidential records but still need to see who opened them.
    const { data } = await supabase.rpc("rms_record_id_by_tracking", { p_tracking: sp.record.trim().toUpperCase() });
    recordId = (typeof data === "string" && data) || "00000000-0000-0000-0000-000000000000";
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
        <h1 className="text-2xl font-bold">{t("Access history")}</h1>
        <p className="text-sm text-slate-600">{t("Sign-ins, failed attempts, records opened and files downloaded, with IP address. Entries cannot be edited or deleted.")}</p>
      </div>

      <Form action="/admin/access" prefetch={false} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="acc-user">{t("User")}</label>
          <select id="acc-user" name="user" defaultValue={sp.user ?? ""} className="input min-h-12 w-56">
            <option value="">{t("Everyone")}</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="acc-record">{t("Record (tracking no.)")}</label>
          <input id="acc-record" name="record" defaultValue={sp.record ?? ""} className="input min-h-12 w-52 font-mono" placeholder={t("IN-2026-0001")} />
        </div>
        <div>
          <label className="label" htmlFor="acc-event">{t("Event")}</label>
          <select id="acc-event" name="event" defaultValue={sp.event ?? ""} className="input min-h-12 w-48">
            <option value="">{t("All events")}</option>
            {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </div>
        <button className="btn-secondary">{t("Filter")}</button>
        {(sp.user || sp.record || sp.event) && <Link href="/admin/access" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("Clear")}</Link>}
      </Form>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-sm font-semibold text-slate-600">
            <tr><th className="px-3 py-2">{t("When")}</th><th className="px-3 py-2">{t("Who")}</th><th className="px-3 py-2">{t("Event")}</th><th className="px-3 py-2">{t("Record / file")}</th><th className="px-3 py-2">{t("IP address")}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={ALERT.has(r.event) ? "bg-red-50/60" : ""}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.created_at, lang)}</td>
                <td className="px-3 py-2">{r.user?.full_name ?? r.email ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {t(EVENT_LABEL[r.event] ?? r.event)}
                  {r.event === "login_failed" && r.detail?.attempt ? <span className="text-xs text-slate-500"> (attempt {String(r.detail.attempt)})</span> : null}
                </td>
                <td className="px-3 py-2">
                  {r.record ? <Link className="tap-link font-mono whitespace-nowrap text-brand-700 hover:underline" href={`/records/${r.record.id}`}>{r.record.tracking_no}</Link> : r.detail?.file ? t("Confidential record") : "—"}
                  {r.record && r.detail?.file ? <span className="text-slate-600"> · {String(r.detail.file)}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600" title={r.user_agent ?? ""}>{r.ip || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{t("No entries match.")}</td></tr>}
          </tbody>
        </table>
      </section>
      {!sp.more && (
        <p>
          <Link className="btn-secondary" href={`/admin/access?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), more: "1" } as Record<string, string>)}`}>
            {t("Show older entries")}
          </Link>
        </p>
      )}

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="font-semibold">{t("Who accessed this person's records?")}</h2>
          <p className="text-sm text-slate-600">
            {t("For Data Privacy Act requests. Lists every time a record naming this person as sender or recipient was opened or downloaded.")}
          </p>
        </div>
        <Form action="/admin/access" prefetch={false} className="flex flex-wrap gap-2">
          <label htmlFor="acc-person" className="sr-only">{t("Person's name")}</label>
          <input id="acc-person" name="person" defaultValue={sp.person ?? ""} className="input w-72" placeholder={t("e.g. Juan dela Cruz")} minLength={3} required />
          <button className="btn-secondary">{t("Run report")}</button>
        </Form>
        {report?.error && <p className="text-sm text-red-700">{report.error.message}</p>}
        {report?.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-sm font-semibold text-slate-600">
                <tr><th className="px-3 py-2">{t("When")}</th><th className="px-3 py-2">{t("Who")}</th><th className="px-3 py-2">{t("What")}</th><th className="px-3 py-2">{t("Record")}</th><th className="px-3 py-2">{t("IP")}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(report.data as { tracking_no: string; subject: string; record_id: string; event: string; accessed_by: string; ip: string | null; accessed_at: string }[]).map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(r.accessed_at, lang)}</td>
                    <td className="px-3 py-2">{r.accessed_by}</td>
                    <td className="px-3 py-2">{t(EVENT_LABEL[r.event] ?? r.event)}</td>
                    <td className="px-3 py-2">{r.subject === "(confidential)" ? <span className="font-mono whitespace-nowrap">{r.tracking_no}</span> : <Link className="tap-link font-mono whitespace-nowrap text-brand-700 hover:underline" href={`/records/${r.record_id}`}>{r.tracking_no}</Link>} <span className="text-slate-600">{r.subject === "(confidential)" ? t("Confidential record") : r.subject}</span></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.ip || "—"}</td>
                  </tr>
                ))}
                {(report.data as unknown[]).length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">{t("No access found for records naming “{name}”.", { name: sp.person ?? "" })}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
