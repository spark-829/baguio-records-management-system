import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canWindowIntake, countOn, differsFromRecommended, featuresOff, hasFeature, isHrmoCss, isOversight, isRecordsDesk, optionalFeaturesFor, startScreen,
  parseFeatureForm, parseFeatures, RECOMMENDED,
} from "../src/lib/office-features";

describe("hasFeature", () => {
  it("records officer and admin see every feature except the city-wide view", () => {
    for (const role of ["records_officer", "admin"] as const) {
      expect(hasFeature({ role, office: null }, "map")).toBe(true);
      expect(hasFeature({ role, office: null }, "oversight")).toBe(false);
    }
  });
  it("others follow the office features; null means off", () => {
    expect(hasFeature({ role: "staff", office: { features: ["map"] } }, "map")).toBe(true);
    expect(hasFeature({ role: "staff", office: { features: ["map"] } }, "boxes")).toBe(false);
    expect(hasFeature({ role: "dept_head", office: { features: null } }, "map")).toBe(false);
    expect(hasFeature({ role: "dept_head", office: null }, "map")).toBe(false);
  });
});

describe("canWindowIntake", () => {
  const f = ["window"];
  it("head yes; staff only with the flag", () => {
    expect(canWindowIntake({ role: "dept_head", features: f })).toBe(true);
    expect(canWindowIntake({ role: "staff", windowFlag: true, features: f })).toBe(true);
    expect(canWindowIntake({ role: "staff", windowFlag: false, features: f })).toBe(false);
    expect(canWindowIntake({ role: "staff", windowFlag: null, features: f })).toBe(false);
  });
  it("viewer and admin never", () => {
    expect(canWindowIntake({ role: "viewer", windowFlag: true, features: f })).toBe(false);
    expect(canWindowIntake({ role: "admin", windowFlag: true, features: f })).toBe(false);
  });
  it("feature off means no", () => {
    expect(canWindowIntake({ role: "dept_head", features: ["map"] })).toBe(false);
    expect(canWindowIntake({ role: "dept_head", features: null })).toBe(false);
  });
});

describe("isOversight and isHrmoCss", () => {
  it("only CMO and CAO heads with the feature", () => {
    expect(isOversight({ role: "dept_head", officeCode: "CMO", features: ["oversight"] })).toBe(true);
    expect(isOversight({ role: "dept_head", officeCode: "CAO", features: ["oversight"] })).toBe(true);
    expect(isOversight({ role: "dept_head", officeCode: "CEO", features: ["oversight"] })).toBe(false);
    expect(isOversight({ role: "staff", officeCode: "CMO", features: ["oversight"] })).toBe(false);
    expect(isOversight({ role: "dept_head", officeCode: "CMO", features: [] })).toBe(false);
  });
  it("HRMO head, or HRMO staff with the window flag", () => {
    expect(isHrmoCss({ role: "dept_head", officeCode: "HRMO" })).toBe(true);
    expect(isHrmoCss({ role: "staff", officeCode: "HRMO", windowFlag: true })).toBe(true);
    expect(isHrmoCss({ role: "staff", officeCode: "HRMO", windowFlag: false })).toBe(false);
    expect(isHrmoCss({ role: "dept_head", officeCode: "CEO" })).toBe(false);
  });
});

describe("parseFeatureForm and friends", () => {
  it("drops unknown keys and oversight for other offices", () => {
    expect(parseFeatureForm("CEO", ["map", "oversight", "nope", "window"])).toEqual(["window", "map"]);
    expect(parseFeatureForm("CMO", ["oversight", "refno"])).toEqual(["refno", "oversight"]);
  });
  it("parseFeatures drops unknown keys", () => {
    expect(parseFeatures(["map", "x", 3])).toEqual(["map"]);
    expect(parseFeatures(null)).toEqual([]);
  });
  it("counts and compares", () => {
    expect(countOn("CEO", RECOMMENDED.CEO)).toEqual({ on: 6, of: 8 });
    expect(countOn("CMO", RECOMMENDED.CMO)).toEqual({ on: 6, of: 9 });
    expect(featuresOff("CEO", RECOMMENDED.CEO)).toHaveLength(2);
    expect(featuresOff("CEO", ["window", "services", "logbook", "copies", "boxes", "map", "satisfaction"])).toEqual(["refno"]);
    expect(featuresOff("CMO", null)).toContain("oversight");
    expect(optionalFeaturesFor("CAO")).toContain("oversight");
    expect(differsFromRecommended("CEO", RECOMMENDED.CEO)).toBe(false);
    expect(differsFromRecommended("CEO", [...RECOMMENDED.CEO].reverse())).toBe(false);
    expect(differsFromRecommended("CEO", ["map"])).toBe(true);
  });
});

describe("RECOMMENDED matches migration 20261125000200", () => {
  const sql = readFileSync("supabase/migrations/20261125000200_rms_office_features.sql", "utf8");
  it("has 22 offices", () => expect(Object.keys(RECOMMENDED)).toHaveLength(22));
  it("same features per office", () => {
    for (const [code, feats] of Object.entries(RECOMMENDED)) {
      const m = sql.match(new RegExp(`\\('${code}',\\s+'\\{([^}]*)\\}'\\)`));
      expect(m, code).not.toBeNull();
      expect(m![1].split(",").sort()).toEqual([...feats].sort());
    }
  });
});

describe("isRecordsDesk", () => {
  it("is true for a records officer at any office", () => {
    expect(isRecordsDesk({ role: "records_officer" })).toBe(true);
    for (const role of ["dept_head", "staff", "admin", "viewer"] as const) {
      expect(isRecordsDesk({ role })).toBe(false);
    }
  });
});

describe("startScreen", () => {
  const win = { features: ["window"] };
  it("picks the start screen by role", () => {
    expect(startScreen({ role: "admin" })).toBe("security");
    expect(startScreen({ role: "records_officer" })).toBe("desk");
    expect(startScreen({ role: "viewer" })).toBe("viewer");
    expect(startScreen({ role: "dept_head", office: win })).toBe("head");
    expect(startScreen({ role: "dept_head", office: { features: [] } })).toBe("head");
  });
  it("gives window staff the window screen only when the office has the window on", () => {
    expect(startScreen({ role: "staff", window_intake: true, office: win })).toBe("window");
    expect(startScreen({ role: "staff", window_intake: true, office: { features: [] } })).toBe("staff");
    expect(startScreen({ role: "staff", window_intake: false, office: win })).toBe("staff");
  });
});
