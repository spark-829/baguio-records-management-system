import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baguio RMS",
  description: "Records Management System demo: register, route, track, search and report on city government documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
