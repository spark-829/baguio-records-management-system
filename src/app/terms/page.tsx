import { pageTitle } from "@/lib/i18n/server";
import { LegalPage } from "@/components/legal-page";
import { TERMS } from "@/lib/legal";

export const generateMetadata = pageTitle("Terms of use");

export default function TermsPage() {
  return <LegalPage doc={TERMS} other={{ href: "/privacy", label: "Privacy notice" }} />;
}
