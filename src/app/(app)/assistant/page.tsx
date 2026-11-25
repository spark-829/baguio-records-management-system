import { getT } from "@/lib/i18n/server";
import { isAiDemo } from "@/lib/ai-demo";
import { getProfile } from "@/lib/session";
import { assistantContext } from "@/lib/chat-prompts";
import { Chat } from "./chat";

export default async function AssistantPage() {
  const [{ t }, me] = await Promise.all([getT(), getProfile()]);
  const ctx = assistantContext(me);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-3 text-2xl font-bold">{t("Records assistant")}</h1>
      <Chat userId={me.id} greeting={ctx.greeting} scope={ctx.scope} office={ctx.office} prompts={ctx.prompts} demo={isAiDemo()} />
    </div>
  );
}
