import { redirect } from "next/navigation";
import { getProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, fmtDate, fmtDateTime } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { unlockUser, updateUser } from "./actions";
import { NewUserForm } from "./new-user-form";

export default async function UsersPage() {
  const me = await getProfile();
  if (me.role !== "admin") redirect("/");
  const supabase = await createClient();
  const [{ data: users }, { data: offices }] = await Promise.all([
    supabase.from("rms_profiles").select("id, full_name, role, office_id, is_active, created_at, locked_until, last_login_at").order("full_name"),
    supabase.from("rms_offices").select("id, code, name").order("code"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">User accounts and access</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Office</th><th className="px-3 py-2">Active</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(users ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-slate-500">
                      since {fmtDate(u.created_at)} · last sign-in {u.last_login_at ? fmtDateTime(u.last_login_at) : "never"}
                    </div>
                    {u.locked_until && new Date(u.locked_until) > new Date() && (
                      <form action={unlockUser} className="mt-1 flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <span className="badge bg-red-100 text-red-800">Locked until {fmtDateTime(u.locked_until)}</span>
                        <button className="text-xs text-brand-700 hover:underline">Unlock</button>
                      </form>
                    )}
                  </td>
                  <td colSpan={4} className="px-3 py-2">
                    <form action={updateUser} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} className="input w-44">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <select name="office_id" defaultValue={u.office_id ?? ""} className="input w-28">
                        {(offices ?? []).map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
                      </select>
                      <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={u.is_active} /> Active</label>
                      <button className="btn-secondary px-2 py-1 text-xs">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Add a user</h2>
          <NewUserForm offices={offices ?? []} />
        </section>
      </div>
    </div>
  );
}
