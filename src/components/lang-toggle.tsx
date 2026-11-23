"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANGS, LANG_COOKIE } from "@/lib/i18n/core";
import { useLang } from "@/lib/i18n/client";

/**
 * Two big buttons, "English" and "Filipino". The choice is saved in a cookie for a year,
 * so the site opens in the same language next time, on this computer or phone.
 */
export function LangToggle({ dark = false }: { dark?: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();

  const choose = (code: string) => {
    if (code === lang) return;
    document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <div
      role="group"
      aria-label="Language / Wika"
      className={`inline-flex rounded-lg border-2 p-0.5 ${dark ? "border-white/60" : "border-brand-700"} ${pending ? "opacity-60" : ""}`}
    >
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code === "fil" ? "fil" : "en"}
            aria-pressed={on}
            onClick={() => choose(l.code)}
            className={`min-h-11 rounded-md px-3 text-sm font-semibold ${
              on ? (dark ? "bg-white text-brand-800" : "bg-brand-700 text-white") : dark ? "text-white hover:bg-white/10" : "text-brand-800 hover:bg-brand-50"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
