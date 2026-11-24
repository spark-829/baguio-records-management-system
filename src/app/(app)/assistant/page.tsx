import { getT } from "@/lib/i18n/server";
import { isAiDemo } from "@/lib/ai-demo";
import { getProfile } from "@/lib/session";
import { Chat } from "./chat";

export default async function AssistantPage() {
  const [{ t }, me] = await Promise.all([getT(), getProfile()]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("Records assistant")}</h1>
        <p className="text-sm text-slate-600">
          {t("Ask in plain words. The assistant searches only the records your account may see, and lists every record it uses under Sources.")}
        </p>
      </div>
      {isAiDemo() && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{t("Practice version:")}</strong> {t("answers here are simpler than the full assistant, but they come from the real records you are allowed to see. You can ask in English or Taglish.")}
        </p>
      )}
      <Chat userId={me.id} />
    </div>
  );
}
