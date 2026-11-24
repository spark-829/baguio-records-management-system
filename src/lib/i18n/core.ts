import { FIL } from "./fil";

export type Lang = "en" | "fil";
export const LANG_COOKIE = "lang";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
];

export function asLang(v: string | undefined | null): Lang {
  return v === "fil" ? "fil" : "en";
}

export type Vars = Record<string, string | number>;
export type T = (english: string, vars?: Vars) => string;

/**
 * Translator keyed by the English text itself, so every screen still reads in English
 * when a phrase has no Filipino yet. "{n}" style placeholders are filled from vars.
 */
export function makeT(lang: Lang): T {
  return (english, vars) => {
    // "From|date": the part after "|" only tells phrases apart for translation; English shows "From"
    let s = (lang === "fil" && FIL[english]) || english.split("|")[0];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** Locale for dates: Filipino month names when Filipino is chosen. */
export const dateLocale = (lang: Lang) => (lang === "fil" ? "fil-PH" : "en-PH");

/** Stored action words ("Received", "Sent to City Engineering Office") shown in the chosen language. Free text passes through. */
export function actionText(text: string | null | undefined, t: T) {
  if (!text) return "";
  const m = /^Sent to (.+)$/.exec(text);
  if (m && m[1] !== "another office") return t("Sent to {office}", { office: m[1] });
  const sent = /^Sent out by (.+?), tracking ([A-Z0-9-]+)$/.exec(text);
  if (sent) return t("Sent out by {how}, tracking {no}", { how: t(sent[1]), no: sent[2] });
  const sentHow = /^Sent out by (.+)$/.exec(text);
  if (sentHow) return t("Sent out by {how}", { how: t(sentHow[1]) });
  const got = /^Delivery recorded: received by (.+) on (\d{1,2} [A-Z][a-z]{2} \d{4})$/.exec(text);
  if (got) return t("Delivery recorded: received by {name} on {date}", { name: got[1], date: got[2] });
  const put = /^Put in box (\S+)$/.exec(text);
  if (put) return t("Put in box {code}", { code: put[1] });
  const moved = /^Moved from box (\S+) to (\S+)$/.exec(text);
  if (moved) return t("Moved from box {a} to {b}", { a: moved[1], b: moved[2] });
  const out = /^Taken out of box (\S+)$/.exec(text);
  if (out) return t("Taken out of box {code}", { code: out[1] });
  return t(text);
}
