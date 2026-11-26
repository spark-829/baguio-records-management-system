import { getT, pageTitle } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaChallenge } from "./challenge";

export const generateMetadata = pageTitle("Two-step sign-in");

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getT();
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">{t("Two-step sign-in")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("Enter the 6-digit code from your authenticator app.")}</p>
        <MfaChallenge next={next} />
      </div>
    </main>
  );
}
