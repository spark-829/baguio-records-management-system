import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, asLang, makeT, type Lang } from "./core";

export async function getLang(): Promise<Lang> {
  return asLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
