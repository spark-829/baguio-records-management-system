import Form from "next/form";
import { getT, pageTitle } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { canWindowIntake } from "@/lib/office-features";
import { USER_STATUSES, filterUsers, hasUserFilters, parseUserFilters, userStatus, usersHref, type UserStatus } from "@/lib/user-list";
import { markPasswordHelpDone, unlockUser, updateUser } from "./actions";
import { NewUserForm } from "./new-user-form";

const STATUS_LABEL: Record<UserStatus, string> = { active: "Active", locked: "Locked", inactive: "Inactive" };
const STATUS_CLASS: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-900",
  locked: "bg-red-50 text-red-800",
  inactive: "bg-slate-100 text-slate-700",
};

type SP = { q?: string; office?: string; role?: string; status?: string; locked?: string; edit?: string; saved?: string; failed?: string; add?: string };

export const generateMetadata = pageTitle("User accounts");

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, lang } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const sp = await searchParams;
  const f = parseUserFilters(sp);
  const supabase = await createClient();
  const [{ data: users }, { data: offices }, { data: helpRows }] = await Promise.all([
    supabase.from("rms_profiles").select("id, full_name, role, office_id, is_active, created_at, locked_until, window_intake").order("full_name"),
    supabase.from("rms_offices").select("id, code, name, features").order("name"),
    // "Forgot password?" requests from the sign-in page (migration 20261126000500); an error just hides the panel.
    supabase.from("rms_password_help").select("id, email, user_id, ip, created_at").is("handled_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const help = (helpRows ?? []) as { id: number; email: string; user_id: string | null; ip: string | null; created_at: string }[];
  // Last sign-in times are for administrators only (QA-077), so they come from an admin-only function.
  // Fallback for the short time before that database update runs: read the column directly.
  let signins = await supabase.rpc("rms_admin_user_signins");
  if (signins.error) signins = await supabase.from("rms_profiles").select("id, last_login_at");
  const lastLogin = new Map(((signins.data ?? []) as { id: string; last_login_at: string | null }[]).map((s) => [s.id, s.last_login_at]));
  const all = (users ?? []).map((u) => ({ ...u, last_login_at: lastLogin.get(u.id) ?? null }));
  const officeBy = new Map((offices ?? []).map((o) => [o.id, o]));
  const rows = filterUsers(all, f);
  const editing = all.find((u) => u.id === sp.edit);
  const saved = all.find((u) => u.id === sp.saved);
  const listHref = usersHref(f);
  const adding = !editing && sp.add === "1";
  const panel = Boolean(editing || adding);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("User accounts")}</h1>
          <p className="mt-1 text-slate-600">{t("One account per staff member. Choose Edit to change a role, an office or whether the person can sign in.")}</p>
        </div>
        {!adding && <Link href={`${usersHref(f, { add: "1" })}#add-user`} className="btn-primary">{t("Add a user")}</Link>}
      </div>

      {help.length > 0 && (
        <section aria-labelledby="pw-help-h" className="card border-amber-300 bg-amber-50 p-4">
          <h2 id="pw-help-h" className="text-lg font-bold">{t("Password help requests ({n})", { n: help.length })}</h2>
          <p className="text-sm text-slate-700">{t("Sent from Forgot password? on the sign-in page. Check who is asking through their office before you help, then mark the request handled.")}</p>
          <ul className="mt-3 divide-y divide-amber-200">
            {help.map((h) => {
              const who = h.user_id ? all.find((u) => u.id === h.user_id) : null;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm break-all">{h.email}</div>
                    <div className="text-sm text-slate-700">
                      {who ? (
                        <Link href={`${usersHref(f, { edit: who.id })}#edit-user`} className="underline">{who.full_name}</Link>
                      ) : (
                        t("No account uses this email")
                      )}
                      {" · "}{fmtDateTime(h.created_at, lang)}{h.ip ? ` · ${h.ip}` : ""}
                    </div>
                  </div>
                  <form action={markPasswordHelpDone}>
                    <input type="hidden" name="id" value={h.id} />
                    <button className="btn-secondary min-h-11 px-4 text-sm">{t("Mark handled")}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Form action="/admin/users" prefetch={false} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-56">
          <label className="label" htmlFor="uf-q">{t("Name")}</label>
          <input id="uf-q" name="q" type="text" defaultValue={f.q} className="input" />
        </div>
        <div className="w-full sm:w-64">
          <label className="label" htmlFor="uf-office">{t("Office")}</label>
          <select id="uf-office" name="office" defaultValue={f.office} className="input min-h-12">
            <option value="">{t("All offices")}</option>
            {(offices ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="label" htmlFor="uf-role">{t("Role")}</label>
          <select id="uf-role" name="role" defaultValue={f.role} className="input min-h-12">
            <option value="">{t("All roles")}</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-40">
          <label className="label" htmlFor="uf-status">{t("Status")}</label>
          <select id="uf-status" name="status" defaultValue={f.status} className="input min-h-12">
            <option value="">{t("Any")}</option>
            {USER_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <button className="btn-secondary">{t("Filter")}</button>
          {hasUserFilters(f) && <Link href="/admin/users" className="font-semibold text-brand-700 underline">{t("Clear")}</Link>}
        </div>
      </Form>

      {saved && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">{t("Changes saved for {name}.", { name: saved.full_name })}</p>}

      <div className={panel ? "grid items-start gap-4 lg:grid-cols-3" : undefined}>
        <section className={`card relative overflow-x-auto ${panel ? "lg:col-span-2" : ""}`} aria-labelledby="users-count">
          <h2 id="users-count" className="px-4 pt-4 pb-3 font-semibold">
            {hasUserFilters(f) ? t("{n} of {total} accounts", { n: rows.length, total: all.length }) : t("{n} accounts", { n: all.length })}
          </h2>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-4">{t("Name")}</th>
                <th className="px-3">{t("Role")}</th>
                <th className="px-3">{t("Office")}</th>
                <th className="px-3">{t("Last sign-in")}</th>
                <th className="px-3">{t("Status")}</th>
                <th className="px-4"><span className="sr-only">{t("Edit")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 text-slate-600">{f.status === "locked" ? t("No accounts are locked right now.") : t("No accounts match these filters.")}</td></tr>
              )}
              {rows.map((u) => {
                const status = userStatus(u);
                const office = officeBy.get(u.office_id ?? "");
                const window = u.role === "staff" && canWindowIntake({ role: u.role as Role, windowFlag: u.window_intake, features: office?.features });
                return (
                  <tr key={u.id} className={editing?.id === u.id ? "bg-brand-50" : undefined}>
                    <td className="px-4 font-medium">{u.full_name}</td>
                    <td className="px-3">
                      <span className="whitespace-nowrap">{t(ROLE_LABEL[u.role as Role] ?? u.role)}</span>
                      {window && <span className="block text-slate-600">{t("At the window")}</span>}
                    </td>
                    <td className="px-3">{office?.name ?? "—"}</td>
                    <td className="px-3 whitespace-nowrap">{u.last_login_at ? fmtDateTime(u.last_login_at, lang) : t("Never")}</td>
                    <td className="px-3">
                      <span className={`badge ${STATUS_CLASS[status]}`}>{t(STATUS_LABEL[status])}</span>
                      {status === "locked" && (
                        <form action={unlockUser} className="mt-1">
                          <input type="hidden" name="id" value={u.id} />
                          <button className="min-h-11 text-brand-700" aria-label={t("Unlock {name}", { name: u.full_name })}>{t("Unlock")}</button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <Link href={`${usersHref(f, { edit: u.id })}#edit-user`} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline" aria-label={t("Edit {name}", { name: u.full_name })}>{t("Edit")}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {panel && <aside className="order-first lg:order-none">
          {editing ? (
            <section id="edit-user" className="card scroll-mt-4 p-4" aria-labelledby="edit-user-h">
              <h2 id="edit-user-h" className="font-semibold">{t("Edit {name}", { name: editing.full_name })}</h2>
              <p className="mt-1 text-slate-600">
                {t("since {a} · last sign-in {b}", { a: fmtDate(editing.created_at, lang), b: editing.last_login_at ? fmtDateTime(editing.last_login_at, lang) : t("never") })}
              </p>
              {sp.failed === "1" && <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900">{t("The changes were not saved. Please try again.")}</p>}
              {(() => {
                const off = officeBy.get(editing.office_id ?? "");
                const winOn = !!off?.features?.includes("window");
                const self = editing.id === me.id;
                return (
                  <form action={updateUser} className="mt-4 space-y-4">
                    <input type="hidden" name="id" value={editing.id} />
                    <input type="hidden" name="back" value={listHref} />
                    <div>
                      <label className="label" htmlFor="eu-role">{t("Role")}</label>
                      <select id="eu-role" name="role" defaultValue={editing.role} className="input" disabled={self}>
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="eu-office">{t("Office")}</label>
                      <select id="eu-office" name="office_id" defaultValue={editing.office_id ?? ""} className="input">
                        {(offices ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex min-h-11 items-start gap-3">
                        <input type="checkbox" name="window_intake" className="checkbox mt-1" defaultChecked={!!editing.window_intake} disabled={!winOn} aria-describedby="eu-window-hint" />
                        <span>{t("Receives documents at the office window")}</span>
                      </label>
                      {winOn && <input type="hidden" name="window_shown" value="1" />}
                      <p id="eu-window-hint" className="mt-1 text-slate-600">
                        {winOn
                          ? t("They can log documents that clients hand in at {office}. Department heads can already do this.", { office: off?.name ?? "" })
                          : t("Turn on Office window for {office} first.", { office: off?.name ?? "" })}
                      </p>
                    </div>
                    <label className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" name="is_active" className="checkbox" defaultChecked={editing.is_active} disabled={self} />
                      <span>{t("Can sign in (active)")}</span>
                    </label>
                    {self && (
                      <>
                        <input type="hidden" name="is_active" value="on" />
                        <input type="hidden" name="role" value="admin" />
                        <p className="text-slate-600">{t("You cannot turn off or demote your own account.")}</p>
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-4">
                      <button className="btn-primary">{t("Save changes")}</button>
                      <Link href={listHref} className="font-semibold text-brand-700 underline">{t("Cancel")}</Link>
                    </div>
                  </form>
                );
              })()}
            </section>
          ) : (
            <section id="add-user" className="card scroll-mt-4 p-4" aria-labelledby="add-user-h">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="add-user-h" className="font-semibold">{t("Add a user")}</h2>
                <Link href={listHref} className="font-semibold text-brand-700 underline">{t("Close")}</Link>
              </div>
              <NewUserForm offices={offices ?? []} />
            </section>
          )}
        </aside>}
      </div>
    </div>
  );
}
