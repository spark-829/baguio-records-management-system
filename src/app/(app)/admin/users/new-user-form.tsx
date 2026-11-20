"use client";

import { useActionState } from "react";
import { createUser } from "./actions";

export function NewUserForm({ offices }: { offices: { id: string; code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label">Full name</label><input name="full_name" className="input" required /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
      <div><label className="label">Temporary password</label><input name="password" type="text" minLength={8} className="input" required /></div>
      <div>
        <label className="label">Role</label>
        <select name="role" className="input" defaultValue="staff">
          <option value="staff">Department Staff</option>
          <option value="dept_head">Department Head</option>
          <option value="records_officer">Records Officer</option>
          <option value="admin">Administrator</option>
        </select>
      </div>
      <div>
        <label className="label">Office</label>
        <select name="office_id" className="input" required>
          <option value="">Choose…</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
    </form>
  );
}
