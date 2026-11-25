// Demo sign-in accounts shown on /login, grouped by office. Mirrors
// supabase/seed.sql, seed_more.sql and seed_departments.sql (all active on the
// live demo). Role labels are English; the page wraps them in t().

export type DemoAccount = { email: string; role: string };
export type DemoOffice = { office: string; accounts: DemoAccount[] };

/** Shared password of every demo account (printed on /login). */
export const DEMO_PASSWORD = "Demo@2026";

const HEAD = "Head";
const WINDOW = "Window clerk";
const STAFF = "Staff";

/** The accounts a first-time visitor should try, in order. */
export const DEMO_START: DemoAccount[] = [
  { email: "records@rms-demo.test", role: "Records Officer, City General Services Office (records desk)" },
  { email: "admin@rms-demo.test", role: "Administrator (security and system analytics)" },
  { email: "ccro.window@rms-demo.test", role: "Window clerk, City Civil Registry Office" },
  { email: "cmo.head@rms-demo.test", role: "Head, City Mayor's Office (city-wide view)" },
];

/** Every demo account, grouped by office (A to Z by office name). */
export const DEMO_OFFICES: DemoOffice[] = [
  { office: "Administrator (system)", accounts: [{ email: "admin@rms-demo.test", role: "Administrator" }] },
  { office: "City Accounting Office", accounts: [{ email: "cacco.head@rms-demo.test", role: HEAD }, { email: "cacco.window@rms-demo.test", role: WINDOW }] },
  { office: "City Administrator's Office", accounts: [{ email: "cao.head@rms-demo.test", role: "Head (city-wide view)" }, { email: "admin.office@rms-demo.test", role: STAFF }] },
  { office: "City Assessor's Office", accounts: [{ email: "casso.head@rms-demo.test", role: HEAD }, { email: "casso.window@rms-demo.test", role: WINDOW }] },
  { office: "City Budget Office", accounts: [{ email: "budget.head@rms-demo.test", role: HEAD }] },
  { office: "City Buildings and Architecture Office", accounts: [{ email: "cbao.head@rms-demo.test", role: HEAD }, { email: "cbao.window@rms-demo.test", role: WINDOW }] },
  { office: "City Civil Registry Office", accounts: [{ email: "ccro.head@rms-demo.test", role: HEAD }, { email: "ccro.window@rms-demo.test", role: WINDOW }] },
  { office: "City Disaster Risk Reduction and Management Office", accounts: [{ email: "cdrrmo.head@rms-demo.test", role: HEAD }, { email: "cdrrmo.window@rms-demo.test", role: WINDOW }] },
  { office: "City Engineering Office", accounts: [{ email: "engineering.head@rms-demo.test", role: HEAD }, { email: "engineering.staff@rms-demo.test", role: STAFF }] },
  { office: "City Environment and Parks Management Office", accounts: [{ email: "cepmo.head@rms-demo.test", role: HEAD }, { email: "cepmo.window@rms-demo.test", role: WINDOW }] },
  { office: "City General Services Office", accounts: [{ email: "records@rms-demo.test", role: "Records Officer (records desk)" }] },
  { office: "City Health Services Office", accounts: [{ email: "hso.head@rms-demo.test", role: HEAD }, { email: "hso.window@rms-demo.test", role: WINDOW }] },
  { office: "City Human Resource Management Office", accounts: [{ email: "hrmo.head@rms-demo.test", role: "Head (city-wide satisfaction)" }, { email: "hrmo.staff@rms-demo.test", role: STAFF }] },
  { office: "City Legal Office", accounts: [{ email: "legal.head@rms-demo.test", role: HEAD }] },
  { office: "City Mayor's Office", accounts: [{ email: "cmo.head@rms-demo.test", role: "Head (city-wide view)" }] },
  { office: "City Planning, Development and Sustainability Office", accounts: [{ email: "planning.head@rms-demo.test", role: HEAD }, { email: "viewer@rms-demo.test", role: "Viewer (read-only)" }] },
  { office: "City Social Welfare and Development Office", accounts: [{ email: "cswdo.head@rms-demo.test", role: HEAD }, { email: "cswdo.window@rms-demo.test", role: WINDOW }] },
  { office: "City Tourism, Culture and Arts Office", accounts: [{ email: "ctcao.head@rms-demo.test", role: HEAD }, { email: "ctcao.window@rms-demo.test", role: WINDOW }] },
  { office: "City Treasury Office", accounts: [{ email: "treasury.head@rms-demo.test", role: HEAD }, { email: "treasury.staff@rms-demo.test", role: STAFF }] },
  { office: "City Veterinary and Agriculture Office", accounts: [{ email: "cvao.head@rms-demo.test", role: HEAD }, { email: "cvao.window@rms-demo.test", role: WINDOW }] },
  { office: "Permits and Licensing Division (City Mayor's Office)", accounts: [{ email: "cmo-pld.head@rms-demo.test", role: HEAD }, { email: "cmo-pld.window@rms-demo.test", role: WINDOW }] },
  { office: "Public Employment Service Office", accounts: [{ email: "peso.head@rms-demo.test", role: HEAD }, { email: "peso.window@rms-demo.test", role: WINDOW }] },
  { office: "Sangguniang Panlungsod", accounts: [{ email: "sp.head@rms-demo.test", role: HEAD }, { email: "sp.window@rms-demo.test", role: WINDOW }] },
];

/** Number of distinct demo accounts. */
export function demoAccountCount(offices: DemoOffice[] = DEMO_OFFICES): number {
  return new Set(offices.flatMap((o) => o.accounts.map((a) => a.email))).size;
}

/** A demo address passed in ?email= (prefill only); anything else is ignored. */
export function demoEmailParam(value: string | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]{1,40}@rms-demo\.test$/.test(v) ? v : "";
}

/** Link that reloads /login with the email filled in, keeping ?next=. */
export function demoHref(email: string, next: string): string {
  const q = new URLSearchParams({ email });
  if (next) q.set("next", next);
  return `/login?${q.toString()}#password`;
}
