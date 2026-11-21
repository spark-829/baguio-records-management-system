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
  return t(text);
}
