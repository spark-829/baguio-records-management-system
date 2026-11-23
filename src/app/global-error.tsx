"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";
import { makeT } from "@/lib/i18n/core";

/** Last-resort screen when even the main layout fails. The language is read from the page's lang attribute. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = typeof document !== "undefined" && document.documentElement.lang === "fil" ? "fil" : "en";
  const t = makeT(lang);
  return (
    <html lang={lang}>
      <body className="antialiased">
        <ErrorScreen error={error} reset={reset} t={t} />
      </body>
    </html>
  );
}
