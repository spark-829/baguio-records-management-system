import type { Metadata } from "next";
import "./globals.css";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/client";
import { NavProgress } from "@/components/nav-progress";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Baguio RMS",
  description: "Records Management System demo: register, route, track, search and report on city government documents.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
