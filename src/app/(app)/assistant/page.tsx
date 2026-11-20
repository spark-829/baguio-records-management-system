import { isAiDemo } from "@/lib/ai-demo";
import { Chat } from "./chat";

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Records assistant</h1>
        <p className="text-sm text-slate-600">
          Ask in plain words. The assistant searches only the records your account may see, and links every record it uses.
        </p>
      </div>
      {isAiDemo() && (
        <p className="rounded-lg border border-l-4 border-amber-300 border-l-amber-700 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Practice version:</strong> answers here are simpler than the full assistant, but they come from the real records
          you are allowed to see. You can ask in English or Taglish.
        </p>
      )}
      <Chat />
    </div>
  );
}
