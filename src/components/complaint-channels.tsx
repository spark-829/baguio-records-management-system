import { getT } from "@/lib/i18n/server";
import { CHANNELS } from "@/lib/complaint";

/** Other ways to complain, with the real contact details. Server component. */
export async function ComplaintChannels() {
  const { t } = await getT();
  return (
    <section aria-labelledby="complain-h" className="card space-y-2 p-5">
      <h2 id="complain-h" className="text-xl font-bold">{t("Other ways to complain")}</h2>
      <p>{t("The concerned office must respond within 72 hours.")}</p>
      <ul className="list-disc space-y-1 pl-6">
        {CHANNELS.map((c) => (
          <li key={c.key} className="[overflow-wrap:anywhere]"><a href={c.href}>{t(c.key)}</a>{c.key === "Hotline 8888" ? "" : `: ${c.address}`}</li>
        ))}
      </ul>
    </section>
  );
}
