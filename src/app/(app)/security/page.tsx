import { getProfile, getSettings } from "@/lib/session";
import { MfaSetup } from "./mfa-setup";

export default async function SecurityPage() {
  const [me, settings] = await Promise.all([getProfile(), getSettings()]);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">My account</h1>
      <p className="text-slate-700">
        Signed in as <strong>{me.full_name}</strong>. Nothing on this page is required unless your administrator asks you to.
      </p>
      <section className="card p-4">
        <h2 className="font-semibold">Two-step sign-in (authenticator app)</h2>
        <p className="mt-1 text-sm text-slate-600">
          {me.role === "admin"
            ? "Recommended for administrators. Once it is on, admin tools only work after you enter a code from your phone. This is enforced by the database, not just the screen."
            : "Optional. After your password, you also type a 6-digit code shown on your phone. You need an app such as Google Authenticator. Ask the IT staff if you want help setting it up."}
        </p>
        <MfaSetup />
      </section>
      <section className="card p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Sign-in protection</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>After {settings.lockoutThreshold} wrong passwords the account locks for {settings.lockoutMinutes} minutes.</li>
          <li>You are signed out after {settings.idleTimeoutMinutes} minutes without activity.</li>
          <li>Every sign-in, record opened and file downloaded is logged with the time and the computer it came from (IP address).</li>
        </ul>
      </section>
    </div>
  );
}
