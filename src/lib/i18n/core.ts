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
    let s = lang === "fil" ? (FIL[english] ?? english) : english;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** Locale for dates: Filipino month names when Filipino is chosen. */
export const dateLocale = (lang: Lang) => (lang === "fil" ? "fil-PH" : "en-PH");
