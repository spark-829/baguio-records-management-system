/** Pure logic for the administrator's Security overview (the home page for admins). */

export interface SecuritySummary {
  asOf: string;
  threshold: number;
  bulkThreshold: number;
  counts: {
    loginFailed: number;
    signedIn: number;
    confidentialOpened: number;
    downloads: number;
    afterHours: number;
    afterHoursConfidential: number;
  };
  lockedNow: number;
  admins: { total: number; withMfa: number };
  repeatedFailures: { userId: string; email: string; n: number }[];
  bulkDownloads: { userId: string; name: string; n: number }[];
  events: { at: string; event: string; userId: string | null; who: string; ip: string | null }[];
  audit: {
    total: number;
    pending: number;
    checkedAt: string | null;
    lastFullPassAt: string | null;
  } | null;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown) => Number(x) || 0;
const str = (x: unknown) => (typeof x === "string" ? x : "");
const strOrNull = (x: unknown) => (typeof x === "string" && x ? x : null);
const list = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);

export function parseSecuritySummary(raw: unknown): SecuritySummary | null {
  if (!isObj(raw)) return null;
  const c = isObj(raw.counts) ? raw.counts : {};
  const a = isObj(raw.admins) ? raw.admins : {};
  const au = isObj(raw.audit) ? raw.audit : null;
  return {
    asOf: str(raw.as_of),
    threshold: num(raw.threshold),
    bulkThreshold: num(raw.bulk_threshold),
    counts: {
      loginFailed: num(c.login_failed),
      signedIn: num(c.signed_in),
      confidentialOpened: num(c.confidential_opened),
      downloads: num(c.downloads),
      afterHours: num(c.after_hours),
      afterHoursConfidential: num(c.after_hours_confidential),
    },
    lockedNow: num(raw.locked_now),
    admins: { total: num(a.total), withMfa: num(a.with_mfa) },
    repeatedFailures: list(raw.repeated_failures).map((r) => ({ userId: str(r.user_id), email: str(r.email), n: num(r.n) })),
    bulkDownloads: list(raw.bulk_downloads).map((r) => ({ userId: str(r.user_id), name: str(r.name), n: num(r.n) })),
    events: list(raw.events).map((r) => ({ at: str(r.at), event: str(r.event), userId: strOrNull(r.user_id), who: str(r.who), ip: strOrNull(r.ip) })),
    audit: au
      ? {
          total: num(au.total),
          pending: num(au.pending),
          checkedAt: strOrNull(au.checked_at),
          lastFullPassAt: strOrNull(au.last_full_pass_at),
        }
      : null,
  };
}

/** Plain words for the event names in the access log (keys for t()). */
export const EVENT_WORDS: Record<string, string> = {
  login_failed: "Wrong password",
  account_locked: "Account locked",
  locked_attempt: "Tried a locked account",
  login_success: "Signed in",
  mfa_verified: "Second sign-in step done",
  download: "Downloaded a file",
};

export interface AttentionItem {
  tone: "act" | "check";
  key: string;
  vars: Record<string, string | number>;
  href: string;
  linkKey: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** What needs the administrator, most urgent first, at most 6. `fmt` formats a timestamp for the audit-age row. */
export function attentionItems(s: SecuritySummary, now: Date, fmt: (iso: string) => string = (iso) => iso): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (s.lockedNow > 0) {
    items.push({
      tone: "act",
      key: s.lockedNow === 1 ? "1 account is locked after too many wrong passwords." : "{n} accounts are locked after too many wrong passwords.",
      vars: { n: s.lockedNow },
      href: "/admin/users?locked=1",
      linkKey: "Review in Users",
    });
  }
  if (s.admins.withMfa < s.admins.total) {
    const n = s.admins.total - s.admins.withMfa;
    items.push({
      tone: "act",
      key: n === 1 ? "1 administrator account does not use the second sign-in step." : "{n} administrator accounts do not use the second sign-in step.",
      vars: { n },
      href: "/admin/users",
      linkKey: "Review in Users",
    });
  }
  for (const r of s.repeatedFailures) {
    items.push({
      tone: "check",
      key: "{n} wrong-password attempts for {email} in 24 hours.",
      vars: { n: r.n, email: r.email },
      href: `/admin/access?event=login_failed&user=${encodeURIComponent(r.userId)}`,
      linkKey: "See attempts",
    });
  }
  for (const r of s.bulkDownloads) {
    items.push({
      tone: "check",
      key: "{name} downloaded {n} files within one hour.",
      vars: { name: r.name, n: r.n },
      href: `/admin/access?user=${encodeURIComponent(r.userId)}&event=download`,
      linkKey: "See downloads",
    });
  }
  if (s.counts.afterHoursConfidential > 0) {
    const n = s.counts.afterHoursConfidential;
    items.push({
      tone: "check",
      key: n === 1 ? "1 confidential record was opened outside office hours." : "{n} confidential records were opened outside office hours.",
      vars: { n },
      href: "/admin/access?event=view_record",
      linkKey: "See who",
    });
  }
  if (s.audit) {
    const at = s.audit.checkedAt;
    const old = !at || now.getTime() - new Date(at).getTime() > DAY_MS;
    if (s.audit.pending > 0 || old) {
      items.push({
        tone: "check",
        key: at ? "The audit log was last checked {date}." : "The audit log has not been checked yet.",
        vars: at ? { date: fmt(at) } : {},
        href: "/admin/audit",
        linkKey: "Open Audit log",
      });
    }
  }
  return items.slice(0, 6);
}

export function findingText(n: number): { key: string; vars: Record<string, number> } {
  if (n <= 0) return { key: "Nothing needs you right now.", vars: {} };
  if (n === 1) return { key: "1 thing needs you today.", vars: {} };
  return { key: "{n} things need you today.", vars: { n } };
}
