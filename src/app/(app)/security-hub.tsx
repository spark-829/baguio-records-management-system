import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/labels";
import type { Profile } from "@/lib/types";
import { EVENT_WORDS, attentionItems, findingText, parseSecuritySummary } from "@/lib/security-hub";

const ADMIN_PAGES = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/access", label: "Access history" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/bin", label: "Bin" },
  { href: "/admin/settings", label: "Settings" },
];

/** The administrator's home: is anything wrong with access right now? One RPC feeds the whole screen. */
export async function SecurityHub({ me }: { me: Profile }) {
  if (me.role !== "admin") return null;
  const { t } = await getT();
  const settings = await getSettings();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rms_admin_security_summary");
  if (error) console.error("rms_admin_security_summary failed", error.message);
  const s = error ? null : parseSecuritySummary(data);

  const items = s ? attentionItems(s, new Date(), fmtDateTime) : [];
  const finding = findingText(items.length);

  const strip = s
    ? [
        { label: t("Wrong-password attempts"), value: s.counts.loginFailed, href: "/admin/access?event=login_failed", red: false },
        { label: t("Accounts locked now"), value: s.lockedNow, href: "/admin/users?locked=1", red: s.lockedNow > 0 },
        { label: t("People who signed in"), value: s.counts.signedIn, href: "/admin/access?event=login_success", red: false },
        { label: t("Confidential records opened"), value: s.counts.confidentialOpened, href: "/admin/access?event=view_record", red: false },
        { label: t("Files downloaded"), value: s.counts.downloads, href: "/admin/access?event=download", red: false },
        { label: t("Opened after office hours"), value: s.counts.afterHours, href: "/admin/access", red: false },
      ]
    : [];

  const audit = s?.audit ?? null;
  const asOf = s ? fmtDateTime(s.asOf) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("Security overview")}</h1>
        {s && <p className="mt-1 text-sm text-slate-600">{t("Last 24 hours · as of {time}", { time: asOf })}</p>}
      </div>

      {!s && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800">{t("The security summary could not load. Try again in a minute.")}</p>
          <Link href="/" className="btn-secondary mt-3">{t("Try again")}</Link>
        </div>
      )}

      {s && (
        <>
          <p className="text-lg text-ink">{t(finding.key, finding.vars)}</p>

          <section className="card" aria-labelledby="attention-title">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h2 id="attention-title" className="text-lg font-bold">{t("Needs your attention")}</h2>
              <p className="text-sm text-slate-600">{t("Most urgent first. Each item links to the page where you can act.")}</p>
            </div>
            {items.length === 0 ? (
              <div className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr] sm:items-center sm:px-5">
                <span className="badge bg-emerald-100 text-emerald-900 justify-self-start">{t("All clear")}</span>
                <span>{t("Nothing needs your attention. Checked at {time}.", { time: asOf })}</span>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((it, i) => (
                  <li key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4 sm:px-5">
                    <span className={`badge justify-self-start ${it.tone === "act" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                      {t(it.tone === "act" ? "Act now" : "Check")}
                    </span>
                    <span>{t(it.key, it.vars)}</span>
                    <Link prefetch={false} href={it.href} className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t(it.linkKey)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t("Last 24 hours")} className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {strip.map((c) => (
              <Link prefetch={false} key={c.label} href={c.href} className="focus-inset block bg-white px-4 py-3 no-underline hover:bg-brand-50 sm:px-5 sm:py-4">
                <span className="text-sm font-semibold text-brand-700 underline underline-offset-4">{c.label}</span>
                <span className={`block text-2xl font-semibold tabular-nums ${c.red ? "text-red-700" : "text-brand-900"}`}>{c.value}</span>
              </Link>
            ))}
          </section>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {s && (
          <section className="card lg:col-span-2" aria-labelledby="events-title">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <h2 id="events-title" className="text-lg font-bold">{t("Recent security events")}</h2>
              <p className="text-sm text-slate-600">{t("Sign-ins, lockouts and downloads, newest first.")}</p>
            </div>
            {s.events.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600 sm:px-5">{t("No security events in the last 24 hours.")}</p>
            ) : (
              <div tabIndex={0} className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold sm:px-5">{t("When")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("Who")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("What happened")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("IP address")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.events.map((e, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-4 py-2 sm:px-5">{fmtDateTime(e.at)}</td>
                        <td className="px-3 py-2">{e.who || "—"}</td>
                        <td className="px-3 py-2">{EVENT_WORDS[e.event] ? t(EVENT_WORDS[e.event]) : e.event}</td>
                        <td className="px-3 py-2 font-mono">{e.ip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line px-4 py-1 sm:px-5">
              <Link prefetch={false} href="/admin/access" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("See all in Access history")}</Link>
            </p>
          </section>
        )}

        <section className={`card lg:self-start ${s ? "" : "lg:col-span-3"}`} aria-labelledby="health-title">
          <h2 id="health-title" className="border-b border-line px-4 py-3 text-lg font-bold sm:px-5">{t("Security health")}</h2>
          <dl className="divide-y divide-line">
            {s && (
              <div className="px-4 py-3 sm:px-5">
                <dt className="text-sm font-semibold text-slate-600">{t("Audit log check")}</dt>
                {audit === null ? (
                  <dd>
                    <span className="badge bg-amber-100 text-amber-900">{t("Unknown")}</span>
                    <span className="mt-1 block text-sm text-slate-600">{t("Could not check the audit log right now.")}</span>
                  </dd>
                ) : audit.checkedAt && audit.pending === 0 && Date.now() - new Date(audit.checkedAt).getTime() <= 24 * 3600_000 ? (
                  <dd>
                    <span className="badge bg-emerald-100 text-emerald-900">{t("Checked")}</span>
                    <span className="mt-1 block text-sm text-slate-600">{t("{total} entries · last checked {time}", { total: audit.total, time: fmtDateTime(audit.checkedAt) })}</span>
                  </dd>
                ) : (
                  <dd>
                    <span className="badge bg-amber-100 text-amber-900">{t("Check due")}</span>
                    <span className="mt-1 block text-sm text-slate-600">
                      <Link prefetch={false} href="/admin/audit" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("Open Audit log to run the check.")}</Link>
                    </span>
                  </dd>
                )}
              </div>
            )}
            {s && (
              <div className="px-4 py-3 sm:px-5">
                <dt className="text-sm font-semibold text-slate-600">{t("Second sign-in step for administrators")}</dt>
                <dd className={s.admins.withMfa < s.admins.total ? "font-semibold text-red-700" : ""}>
                  {t("{a} of {b} set up", { a: s.admins.withMfa, b: s.admins.total })}
                  {s.admins.withMfa < s.admins.total && <> · {t("Missing")}</>}
                </dd>
              </div>
            )}
            <div className="px-4 py-3 sm:px-5">
              <dt className="text-sm font-semibold text-slate-600">{t("Account lockout")}</dt>
              <dd>{t("After {n} wrong passwords, for {m} minutes", { n: settings.lockoutThreshold, m: settings.lockoutMinutes })}</dd>
            </div>
            <div className="px-4 py-3 sm:px-5">
              <dt className="text-sm font-semibold text-slate-600">{t("Automatic sign-out")}</dt>
              <dd>{t("After {n} minutes of no activity", { n: settings.idleTimeoutMinutes })}</dd>
            </div>
          </dl>
          <p className="border-t border-line px-4 py-1 sm:px-5">
            <Link prefetch={false} href="/admin/settings" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">{t("Change in Settings")}</Link>
          </p>
        </section>
      </div>

      <nav aria-label={t("Admin pages")}>
        <h2 className="text-lg font-bold">{t("Admin pages")}</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-x-6">
          {ADMIN_PAGES.map((p) => (
            <li key={p.href}>
              <Link prefetch={false} href={p.href} className="inline-flex min-h-11 min-w-11 items-center font-semibold text-brand-700 underline">{t(p.label)}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
