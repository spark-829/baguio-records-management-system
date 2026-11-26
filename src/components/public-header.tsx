import { getT } from "@/lib/i18n/server";
import { BrandLockup } from "@/components/brand";
import { LangToggle } from "@/components/lang-toggle";
import { CodeIcon } from "@/components/icons";

/** Header for pages people see before signing in (sign-in, terms, privacy): logo, language, and About the developer on the sign-in page only. */
export async function PublicHeader({ width = "max-w-7xl", developer = false }: { width?: string; developer?: boolean }) {
  const { t } = await getT();
  return (
    <header className="on-dark border-b-4 border-gold-500 bg-brand-700 text-white">
      <div className={`mx-auto flex ${width} flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:py-3`}>
        <BrandLockup />
        <div className="ml-auto flex items-center gap-2">
          {developer && <DeveloperLink label={t("About the developer")} short={t("Developer")} />}
          <LangToggle dark />
        </div>
      </div>
    </header>
  );
}

/** Small header link to /developer: icon only on phones, icon and word from sm up. */
function DeveloperLink({ label, short }: { label: string; short: string }) {
  return (
    <a
      href="/developer"
      title={label}
      aria-label={label}
      className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border-2 border-white/60 px-2.5 font-semibold text-white no-underline hover:bg-white/10"
    >
      <CodeIcon className="h-5 w-5" />
      <span aria-hidden="true" className="hidden sm:inline">{short}</span>
    </a>
  );
}
