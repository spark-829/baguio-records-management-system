import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { canWindowIntake } from "@/lib/office-features";
import { unlockUser, updateUser } from "./actions";
import { NewUserForm } from "./new-user-form";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const { t } = await getT();
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const lockedOnly = (await searchParams).locked === "1";
  const supabase = await createClient();
  const [{ data: users }, { data: offices }] = await Promise.all([
    supabase.from("rms_profiles").select("id, full_name, role, office_id, is_active, created_at, locked_until, last_login_at, window_intake").order("full_name"),
    supabase.from("rms_offices").select("id, code, name, features").order("code"),
  ]);
  const officeBy = new Map((offices ?? []).map((o) => [o.id, o]));
  const rows = (users ?? []).filter((u) => !lockedOnly || (u.locked_until && new Date(u.locked_until) > new Date()));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("User accounts and access")}</h1>
      {lockedOnly && (
        <p className="text-sm text-slate-600">
          {t("Showing locked accounts only.")}{" "}
          <Link href="/admin/users" className="font-semibold text-brand-700 underline">{t("Show all users")}</Link>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">{t("Name")}</th><th className="px-3 py-2">{t("Role")}</th><th className="px-3 py-2">{t("Office")}</th><th className="px-3 py-2">{t("Active")}</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lockedOnly && rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-slate-600">{t("No accounts are locked right now.")}</td></tr>
              )}
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {u.full_name}
                      {canWindowIntake({ role: u.role as Role, windowFlag: u.window_intake, features: officeBy.get(u.office_id ?? "")?.features }) && (
                        <span className="badge ml-2 bg-slate-100 text-slate-800">{t("Window")}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t("since {a} · last sign-in {b}", { a: fmtDate(u.created_at), b: u.last_login_at ? fmtDateTime(u.last_login_at) : t("never") })}
                    </div>
                    {u.locked_until && new Date(u.locked_until) > new Date() && (
                      <form action={unlockUser} className="mt-1 flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <span className="badge bg-red-100 text-red-800">{t("Locked until {date}", { date: fmtDateTime(u.locked_until) })}</span>
                        <button className="text-xs text-brand-700 hover:underline">{t("Unlock")}</button>
                      </form>
                    )}
                  </td>
                  <td colSpan={4} className="px-3 py-2">
                    <form action={updateUser} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" aria-label={t("Role of {name}", { name: u.full_name })} defaultValue={u.role} className="input w-44">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
                      </select>
                      <select name="office_id" aria-label={t("Office of {name}", { name: u.full_name })} defaultValue={u.office_id ?? ""} className="input w-56">
                        {(offices ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      {(() => {
                        const off = officeBy.get(u.office_id ?? "");
                        const winOn = !!off?.features?.includes("window");
                        return (
                          <div className="basis-full">
                            <label className="flex min-h-11 items-center gap-2">
                              <input type="checkbox" name="window_intake" className="checkbox" defaultChecked={!!u.window_intake} disabled={!winOn} />
                              {t("Receives documents at the office window")}
                            </label>
                            {winOn && <input type="hidden" name="window_shown" value="1" />}
                            <p className="text-xs text-slate-600">
                              {winOn
                                ? t("They can log documents that clients hand in at {office}. Department heads can already do this.", { office: off?.name ?? "" })
                                : t("Turn on Office window for {office} first.", { office: off?.name ?? "" })}
                            </p>
                          </div>
                        );
                      })()}
                      <label className="flex min-h-11 items-center gap-1"><input type="checkbox" name="is_active" className="checkbox" defaultChecked={u.is_active} aria-label={t("{name} can sign in", { name: u.full_name })} /> {t("Active")}</label>
                      <button className="btn-secondary px-3 py-2 text-sm" aria-label={t("Save changes for {name}", { name: u.full_name })}>{t("Save")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t("Add a user")}</h2>
          <NewUserForm offices={offices ?? []} />
        </section>
      </div>
    </div>
  );
}
