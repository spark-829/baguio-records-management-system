import type { Role } from "./types";

/** Features an administrator can turn on or off per office (hiding only; nothing is ever deleted). */
export const FEATURES = ["window", "services", "logbook", "copies", "boxes", "map", "satisfaction", "refno"] as const;
export type FeatureKey = (typeof FEATURES)[number] | "oversight";

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  window: "Office window",
  services: "Services catalog",
  logbook: "Released documents logbook",
  copies: "Requests for copy",
  boxes: "Boxes",
  map: "Barangay map",
  satisfaction: "Client satisfaction report",
  refno: "Reference number field",
  oversight: "City-wide view",
};

export const FEATURE_HINT: Record<FeatureKey, string> = {
  window: "Staff marked as window staff can log documents handed in here.",
  services: "Register shows this office's Citizen's Charter services first.",
  logbook: "A list of documents released to clients, with who received them.",
  copies: "Clients can ask for copies of records this office keeps.",
  boxes: "Storage boxes with labels for paper files.",
  map: "Records counted by barangay on a map.",
  satisfaction: "Monthly survey results for this office.",
  refno: "A box for the number from another system, such as a permit number.",
  oversight: "Department heads can watch lateness in every office, read-only.",
};

export const REF_LABEL_DEFAULT = "Reference no. from another system";

/** Same sets as migration 20261125000200 (a test compares them). */
export const RECOMMENDED: Record<string, FeatureKey[]> = {
  CMO: ["services", "satisfaction", "refno", "window", "logbook", "oversight"],
  CAO: ["services", "satisfaction", "refno", "window", "logbook", "oversight"],
  CEO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  CTO: ["services", "satisfaction", "refno", "window", "logbook"],
  CBO: ["services", "satisfaction", "refno"],
  HRMO: ["services", "satisfaction", "refno", "window", "logbook", "copies"],
  CLO: ["services", "satisfaction", "refno", "window", "logbook", "copies"],
  CPDO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  SP: ["services", "satisfaction", "refno", "window", "logbook", "copies", "boxes"],
  CACCO: ["services", "satisfaction", "refno", "window"],
  CASSO: ["services", "satisfaction", "refno", "window", "logbook", "copies", "map"],
  CBAO: ["services", "satisfaction", "refno", "window", "logbook", "copies", "map"],
  CCRO: ["services", "satisfaction", "refno", "window", "logbook", "copies", "boxes"],
  CEPMO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  CGSO: ["services", "satisfaction", "refno", "logbook", "copies", "boxes", "map"],
  HSO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  CSWDO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  CTCAO: ["services", "satisfaction", "refno", "window", "logbook"],
  CVAO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
  "CMO-PLD": ["services", "satisfaction", "refno", "window", "logbook", "map"],
  PESO: ["services", "satisfaction", "refno", "window", "logbook"],
  CDRRMO: ["services", "satisfaction", "refno", "window", "logbook", "map"],
};

const ALL_KEYS: readonly string[] = [...FEATURES, "oversight"];

function isOversightOffice(code: string | null | undefined) {
  return code === "CMO" || code === "CAO";
}

/** The features an administrator can switch for this office ("oversight" only for CMO and CAO). */
export function optionalFeaturesFor(code: string): FeatureKey[] {
  return isOversightOffice(code) ? [...FEATURES, "oversight"] : [...FEATURES];
}

/** Keep only known feature keys. */
export function parseFeatures(v: unknown): FeatureKey[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is FeatureKey => typeof x === "string" && ALL_KEYS.includes(x));
}

interface FeatureMe {
  role: Role;
  office?: { code?: string | null; features?: string[] | null } | null;
}

/** Records officer and admin see every feature (except the city-wide view, which is for CMO and CAO heads only). */
export function hasFeature(me: FeatureMe, key: FeatureKey): boolean {
  if (me.role === "records_officer" || me.role === "admin") return key !== "oversight";
  return !!me.office?.features?.includes(key);
}

/** Mirror of rms_can_window_intake(): office head, or staff flagged as window staff, when the office has Office window on. */
export function canWindowIntake(p: { role: Role; windowFlag?: boolean | null; features?: string[] | null }): boolean {
  if (!p.features?.includes("window")) return false;
  return p.role === "dept_head" || (p.role === "staff" && !!p.windowFlag);
}

/** Mirror of rms_is_oversight(): CMO or CAO head with the feature on. */
export function isOversight(p: { role: Role; officeCode?: string | null; features?: string[] | null }): boolean {
  return p.role === "dept_head" && isOversightOffice(p.officeCode) && !!p.features?.includes("oversight");
}

/** Mirror of rms_is_hrmo_css(): HRMO head, or HRMO staff flagged as window staff. */
export function isHrmoCss(p: { role: Role; officeCode?: string | null; windowFlag?: boolean | null }): boolean {
  return p.officeCode === "HRMO" && (p.role === "dept_head" || (p.role === "staff" && !!p.windowFlag));
}

/** CGSO records desk: records officer whose office is CGSO. Gates the desk start screen and saved views. */
export function isRecordsDesk(me: { role: Role; office?: { code?: string | null } | null }): boolean {
  return me.role === "records_officer" && me.office?.code === "CGSO";
}

/** Features ticked in the admin form, limited to the ones that office may have. */
export function parseFeatureForm(code: string, entries: Iterable<FormDataEntryValue>): FeatureKey[] {
  const allowed = optionalFeaturesFor(code);
  const picked = new Set<string>();
  for (const v of entries) if (typeof v === "string") picked.add(v);
  return allowed.filter((k) => picked.has(k));
}

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** True when an office's features differ from the recommended set (the "Changed" badge). */
export function differsFromRecommended(code: string, features: string[] | null | undefined): boolean {
  const rec = RECOMMENDED[code];
  if (!rec) return false;
  return !sameSet(parseFeatures(features ?? []), rec);
}

/** "x of y" for the offices table: optional features on, out of the ones the office can have. */
export function countOn(code: string, features: string[] | null | undefined): { on: number; of: number } {
  const allowed = optionalFeaturesFor(code);
  const have = parseFeatures(features ?? []);
  return { on: allowed.filter((k) => have.includes(k)).length, of: allowed.length };
}

/** The switchable features this office has turned off, in the usual order. */
export function featuresOff(code: string, features: string[] | null | undefined): FeatureKey[] {
  const have = parseFeatures(features ?? []);
  return optionalFeaturesFor(code).filter((k) => !have.includes(k));
}
