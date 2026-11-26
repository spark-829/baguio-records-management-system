import { pageTitle } from "@/lib/i18n/server";
import { LegalPage } from "@/components/legal-page";
import { PRIVACY } from "@/lib/legal";

export const generateMetadata = pageTitle("Privacy notice");

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ href: "/terms", label: "Terms of use" }} />;
}
