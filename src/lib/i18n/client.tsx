"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Lang } from "./core";

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function useT() {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
