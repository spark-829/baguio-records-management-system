import { getT } from "@/lib/i18n/server";

/** Demo contact for the City's Data Protection Officer (a .test address: nothing is sent anywhere). */
export const DPO_CONTACT = "dpo@rms-demo.test";

type Where = "register" | "track" | "survey" | "receipt";

/**
 * Privacy notice shown wherever a citizen's personal data is collected or shown (QA-096, Data Privacy Act
 * of 2012, sections 16 and 18): what is collected, why, who sees it, how long it is kept, the person's rights,
 * the DPO contact, and the AI service used in this demo.
 */
export async function PrivacyNotice({ where }: { where: Where }) {
  const { t } = await getT();
  const what: Record<Where, string> = {
    register: "We record the name, organization, address or barangay, contact details and the document of the person who filed it.",
    track: "We only use the tracking number you enter to show where your document is. We keep a short log of lookups (time and network address) to stop misuse.",
    survey: "Your answers are anonymous unless you choose to write your name or contact details.",
    receipt: "We recorded the name, organization, contact details and document of the person who filed it.",
  };
  const body = (
    <>
      <p>{t(what[where])}</p>
      <p>
        {t(
          "Purpose: to act on the request and keep the public record, as allowed by Republic Act No. 10173 (Data Privacy Act), RA 11032 (Ease of Doing Business) and records laws. Staff lists show names masked, and every view and download is logged.",
        )}
      </p>
      <p>{t("Kept for the period set in the records retention schedule of the National Archives of the Philippines, then disposed of properly.")}</p>
      <p>
        {t(
          "Your rights: to be informed, to access, to correct, to object, to erasure or blocking where the law allows, and to complain to the National Privacy Commission. Ask the City's Data Protection Officer: {contact}.",
          { contact: DPO_CONTACT },
        )}
      </p>
      <p>
        {t(
          "In this demo, some AI features use DeepSeek, an AI service outside the Philippines. Summaries and the assistant get records with names and contact details removed, and confidential records are never sent. Reading a scanned letter to fill in the form sends that letter's text.",
        )}
      </p>
    </>
  );
  if (where === "receipt") {
    return <div className="mt-4 space-y-1 border-t border-slate-300 pt-3 text-xs text-slate-700">{body}</div>;
  }
  return (
    <details className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-brand-800">{t("How we use personal data (Data Privacy Act of 2012)")}</summary>
      <div className="mt-2 space-y-2 pb-2">{body}</div>
    </details>
  );
}
